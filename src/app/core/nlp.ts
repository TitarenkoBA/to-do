import { Priority, Repeat } from './models';
import { addDays, addMonths, dateKey, parseKey, timeStr } from './util';

export interface Parsed {
  title: string;
  due?: string;
  time?: string;
  priority?: Priority;
  tags: string[];
  repeat?: Repeat;
  remind?: boolean;
  list?: string;
}

const WD: Record<string, number> = {
  пн: 1, понедельник: 1, вт: 2, вторник: 2, ср: 3, среду: 3, среда: 3, чт: 4, четверг: 4,
  пт: 5, пятницу: 5, пятница: 5, сб: 6, субботу: 6, суббота: 6, вс: 0, воскресенье: 0,
};
const WD_RE = Object.keys(WD).sort((a, b) => b.length - a.length).join('|');

const MONTHS: Record<string, number> = {
  января: 0, янв: 0, февраля: 1, фев: 1, марта: 2, мар: 2, апреля: 3, апр: 3, мая: 4,
  июня: 5, июн: 5, июля: 6, июл: 6, августа: 7, авг: 7, сентября: 8, сен: 8, сент: 8,
  октября: 9, окт: 9, ноября: 10, ноя: 10, декабря: 11, дек: 11,
};
const MON_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const B = '(?<=\\s)';
const E = '(?=\\s)';
const re = (src: string) => new RegExp(B + src + E, 'iu');

function nextWeekday(from: string, wd: number, includeToday = false): string {
  let diff = (wd - parseKey(from).getDay() + 7) % 7;
  if (diff === 0 && !includeToday) diff = 7;
  return addDays(from, diff);
}

/**
 * Natural-language quick add (Russian):
 * «Позвонить маме завтра в 19:00 #семья !1 напомни»
 */
export function parseQuick(input: string, now = new Date()): Parsed {
  let s = ` ${input} `;
  const out: Parsed = { title: '', tags: [] };
  const today = dateKey(now);

  const take = (r: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(r);
    if (m && fn(m) !== false) s = s.replace(m[0], ' ');
  };

  // #tags
  s = s.replace(/(?<=\s)#([\p{L}\p{N}_-]+)/gu, (_, t: string) => {
    out.tags.push(t.toLowerCase());
    return ' ';
  });
  // @list
  take(/(?<=\s)@([\p{L}\p{N}_-]+)(?=\s)/u, (m) => {
    out.list = m[1];
  });
  // priority
  take(/(?<=\s)!([1-3])(?=\s)/u, (m) => {
    out.priority = (4 - Number(m[1])) as Priority;
  });
  take(/(?<=\s)(!{1,3})(?=\s)/u, (m) => {
    out.priority = m[1].length as Priority;
  });

  // repeat
  const reps: [string, Repeat][] = [
    ['(?:каждый день|ежедневно)', 'daily'],
    ['(?:по будням|каждый будний день)', 'weekdays'],
    ['(?:каждую неделю|еженедельно)', 'weekly'],
    ['(?:каждый месяц|ежемесячно)', 'monthly'],
    ['(?:каждый год|ежегодно)', 'yearly'],
  ];
  for (const [src, r] of reps) take(re(src), () => void (out.repeat = r));
  take(re(`(?:каждый|каждую|каждое|по)\\s+(${WD_RE})`), (m) => {
    out.repeat = 'weekly';
    out.due = nextWeekday(today, WD[m[1].toLowerCase()], true);
  });

  take(re('напомн(?:и|ить)'), () => void (out.remind = true));

  // relative "через ..."
  take(
    re('через\\s+(?:(\\d+)\\s*)?(полчаса|минут[уы]?|мин|час(?:а|ов)?|ч|дн(?:я|ей)|день|недел[юиь]|месяц(?:а|ев)?)'),
    (m) => {
      const n = m[1] ? Number(m[1]) : 1;
      const unit = m[2].toLowerCase();
      if (unit === 'полчаса' || unit.startsWith('мин') || unit.startsWith('ч')) {
        const mins = unit === 'полчаса' ? 30 : unit.startsWith('мин') ? n : n * 60;
        const d = new Date(now.getTime() + mins * 60000);
        out.due = dateKey(d);
        out.time = timeStr(d);
        out.remind = true;
      } else if (unit.startsWith('д')) out.due = addDays(today, n);
      else if (unit.startsWith('нед')) out.due = addDays(today, n * 7);
      else out.due = addMonths(today, n);
    },
  );

  take(re('послезавтра'), () => void (out.due = addDays(today, 2)));
  take(re('завтра'), () => void (out.due = addDays(today, 1)));
  take(re('сегодня'), () => void (out.due = today));
  take(re('на выходных'), () => void (out.due = nextWeekday(today, 6, true)));
  take(re('на следующей неделе'), () => void (out.due = nextWeekday(today, 1)));
  take(re(`(?:в|во)\\s+(${WD_RE})`), (m) => {
    out.due = nextWeekday(today, WD[m[1].toLowerCase()]);
  });

  // time
  const setTime = (h: number, min: number, part?: string) => {
    part = part?.toLowerCase();
    if ((part === 'вечера' || part === 'дня') && h < 12) h += 12;
    if (part === 'ночи' && h === 12) h = 0;
    if (h > 23 || min > 59) return false;
    out.time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    return true;
  };
  take(re('(?:в|к)\\s+(\\d{1,2})(?::(\\d{2}))?(?:\\s*(утра|дня|вечера|ночи))?'), (m) =>
    setTime(Number(m[1]), Number(m[2] ?? 0), m[3]),
  );
  if (!out.time) take(re('(\\d{1,2}):(\\d{2})'), (m) => setTime(Number(m[1]), Number(m[2])));
  if (!out.time) {
    take(re('утром'), () => void (out.time = '09:00'));
    take(re('(?:днём|днем)'), () => void (out.time = '13:00'));
    take(re('вечером'), () => void (out.time = '19:00'));
  }

  // dates
  take(re('(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?'), (m) => {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return false;
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    let key = dateKey(new Date(y, mo, d));
    if (!m[3] && key < today) key = dateKey(new Date(y + 1, mo, d));
    out.due = key;
    return true;
  });
  take(re(`(\\d{1,2})\\s+(${MON_RE})\\.?(?:\\s+(\\d{4}))?`), (m) => {
    const mo = MONTHS[m[2].toLowerCase()];
    const d = Number(m[1]);
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    let key = dateKey(new Date(y, mo, d));
    if (!m[3] && key < today) key = dateKey(new Date(++y, mo, d));
    out.due = key;
  });

  if (out.time && !out.due) out.due = out.time > timeStr(now) ? today : addDays(today, 1);
  if (out.repeat && !out.due) out.due = today;

  const title = s.replace(/\s+/g, ' ').trim();
  out.title = title.charAt(0).toUpperCase() + title.slice(1);
  return out;
}
