import { nextOccurrence, occursOn } from './data.service';
import { Task } from './models';
import { parseQuick } from './nlp';
import { toICS, parseICS } from './io.service';

// Wednesday, 21 Oct 2026, 14:00
const NOW = new Date(2026, 9, 21, 14, 0);

describe('parseQuick', () => {
  it('parses date, time, tag and priority', () => {
    const p = parseQuick('позвонить маме завтра в 19:00 #семья !1', NOW);
    expect(p.title).toBe('Позвонить маме');
    expect(p.due).toBe('2026-10-22');
    expect(p.time).toBe('19:00');
    expect(p.tags).toEqual(['семья']);
    expect(p.priority).toBe(3);
  });

  it('handles weekdays and "вечера"', () => {
    const p = parseQuick('Спортзал в пятницу в 7 вечера', NOW);
    expect(p.due).toBe('2026-10-23');
    expect(p.time).toBe('19:00');
    expect(p.title).toBe('Спортзал');
  });

  it('handles relative time', () => {
    const p = parseQuick('выключить духовку через 30 минут', NOW);
    expect(p.due).toBe('2026-10-21');
    expect(p.time).toBe('14:30');
    expect(p.remind).toBe(true);
  });

  it('handles dates with month names and rolls into next year', () => {
    expect(parseQuick('др Пети 5 января', NOW).due).toBe('2027-01-05');
    expect(parseQuick('отчёт 25.12', NOW).due).toBe('2026-12-25');
  });

  it('handles repeats', () => {
    const p = parseQuick('планёрка каждый понедельник в 10', NOW);
    expect(p.repeat).toBe('weekly');
    expect(p.due).toBe('2026-10-26');
    expect(p.time).toBe('10:00');
    expect(parseQuick('медитация ежедневно', NOW).repeat).toBe('daily');
  });

  it('puts time-only tasks today or tomorrow', () => {
    expect(parseQuick('купить хлеб в 18:00', NOW).due).toBe('2026-10-21');
    expect(parseQuick('будильник в 9 утра', NOW).due).toBe('2026-10-22');
  });

  it('leaves plain text alone', () => {
    const p = parseQuick('прочитать книгу', NOW);
    expect(p).toEqual({ title: 'Прочитать книгу', tags: [] });
  });
});

describe('repeats', () => {
  const t = { due: '2026-10-21', repeat: 'weekly', done: false } as Task;
  it('computes next occurrence', () => {
    expect(nextOccurrence('2026-10-23', 'weekdays')).toBe('2026-10-26');
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('detects occurrences', () => {
    expect(occursOn(t, '2026-10-28')).toBe(true);
    expect(occursOn(t, '2026-10-29')).toBe(false);
    expect(occursOn(t, '2026-10-14')).toBe(false);
  });
});

describe('ics', () => {
  it('round-trips tasks', () => {
    const task = {
      id: 'abc', title: 'Встреча, важная', notes: 'строка 1\nстрока 2', due: '2026-10-22', time: '19:00',
      remind: 15, repeat: 'weekly', done: false, tags: [], subtasks: [],
    } as unknown as Task;
    const ics = toICS([task]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY');
    expect(ics).toContain('TRIGGER:-PT15M');
    const [e] = parseICS(ics);
    expect(e.summary).toBe('Встреча, важная');
    expect(e.description).toBe('строка 1\nстрока 2');
    expect(e.due).toBe('2026-10-22');
    expect(e.time).toBe('19:00');
    expect(e.repeat).toBe('weekly');
  });
});
