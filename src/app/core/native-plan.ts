import { habitActive, habitDone, nextOccurrence } from './data.service';
import { Alarm, Habit, Task } from './models';
import { addDays, at, dateKey, parseKey } from './util';

export type PlannedKind = 'task' | 'alarm' | 'habit';

export interface Planned {
  /** stable key → native id */
  key: string;
  at: number;
  kind: PlannedKind;
  refId: string;
  title: string;
  body: string;
  url: string;
}

/** Android limits pending alarms per app (~500); keep a margin for one-off ones. */
export const PLAN_LIMIT = 400;
export const PLAN_DAYS = 14;

/** Everything that should ring in the next `days` days, soonest first. */
export function planNotifications(
  src: { tasks: Task[]; alarms: Alarm[]; habits: Habit[] },
  now = Date.now(),
  days = PLAN_DAYS,
  limit = PLAN_LIMIT,
): Planned[] {
  const out: Planned[] = [];
  const end = now + days * 86400000;
  const today = dateKey(new Date(now));
  const inRange = (ts: number) => ts > now && ts <= end;

  for (const t of src.tasks) {
    if (t.done || t.remind == null || !t.due) continue;
    let date = t.due;
    for (let i = 0; i < 400; i++) {
      const ts = at(date, t.time || '09:00') - t.remind * 60000;
      if (ts > end) break;
      const alreadyFired = date === t.due && t.remindedAt && t.remindedAt >= ts;
      if (inRange(ts) && !alreadyFired) {
        out.push({
          key: `t:${t.id}:${date}`, at: ts, kind: 'task', refId: t.id, url: '#/today',
          title: `🔔 ${t.title || 'Задача'}`,
          body: t.time ? (t.remind ? `Начало в ${t.time}` : `Сейчас · ${t.time}`) : 'Задача на сегодня',
        });
      }
      if (t.repeat === 'none') break;
      date = nextOccurrence(date, t.repeat);
    }
  }

  for (const a of src.alarms) {
    if (!a.enabled) continue;
    const title = `⏰ ${a.label || 'Будильник'}`;
    if (a.snoozeUntil && inRange(a.snoozeUntil)) {
      out.push({ key: `a:${a.id}:snz`, at: a.snoozeUntil, kind: 'alarm', refId: a.id, url: '#/alarms', title, body: 'Отложенный будильник' });
    }
    const dates = a.days.length
      ? Array.from({ length: days + 1 }, (_, i) => addDays(today, i)).filter((k) => a.days.includes(parseKey(k).getDay()))
      : a.onDate ? [a.onDate] : [];
    for (const date of dates) {
      const ts = at(date, a.time);
      if (!inRange(ts) || a.lastFired === `${date} ${a.time}`) continue;
      out.push({ key: `a:${a.id}:${date}`, at: ts, kind: 'alarm', refId: a.id, url: '#/alarms', title, body: a.time });
    }
  }

  for (const h of src.habits) {
    if (h.archived || !h.remindTime) continue;
    for (let i = 0; i <= days; i++) {
      const date = addDays(today, i);
      const ts = at(date, h.remindTime);
      if (!inRange(ts) || !habitActive(h, date) || habitDone(h, date)) continue;
      out.push({
        key: `h:${h.id}:${date}`, at: ts, kind: 'habit', refId: h.id, url: '#/habits',
        title: `${h.emoji} ${h.name}`, body: h.target > 1 ? `Цель на сегодня: ${h.target} ${h.unit}`.trim() : 'Пора выполнить привычку',
      });
    }
  }

  return out.sort((x, y) => x.at - y.at).slice(0, limit);
}
