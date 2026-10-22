import { planNotifications } from './native-plan';
import { nextOccurrence, occursOn } from './data.service';
import { Alarm, Habit, Task } from './models';
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

describe('planNotifications', () => {
  const base = { notes: '', listId: 'inbox', done: false, priority: 0, tags: [], subtasks: [], attachments: [], pomodoros: 0, order: 0, createdAt: 0, updatedAt: 0 };
  const now = NOW.getTime(); // Wed 21 Oct 2026 14:00

  it('plans task reminders including repeats, skipping past ones', () => {
    const plan = planNotifications({
      tasks: [
        { ...base, id: 'a', title: 'Раз', due: '2026-10-21', time: '18:00', remind: 10, repeat: 'none' },
        { ...base, id: 'b', title: 'Прошло', due: '2026-10-21', time: '09:00', remind: 0, repeat: 'none' },
        { ...base, id: 'c', title: 'Каждый день', due: '2026-10-20', time: '08:00', remind: 0, repeat: 'daily' },
        { ...base, id: 'd', title: 'Без напоминания', due: '2026-10-22', remind: null, repeat: 'none' },
      ] as Task[],
      alarms: [],
      habits: [],
    }, now, 3);
    expect(plan[0].key).toBe('t:a:2026-10-21');
    expect(new Date(plan[0].at).getHours()).toBe(17);
    expect(plan.filter((p) => p.refId === 'c').map((p) => p.key)).toEqual(['t:c:2026-10-22', 't:c:2026-10-23', 't:c:2026-10-24']);
    expect(plan.some((p) => p.refId === 'b' || p.refId === 'd')).toBe(false);
  });

  it('plans alarms by weekday, one-shots and snoozes', () => {
    const plan = planNotifications({
      tasks: [],
      habits: [],
      alarms: [
        { id: 'w', time: '07:30', days: [1, 2, 3, 4, 5], label: '', enabled: true, sound: 'x', snoozeMin: 5, createdAt: 0 },
        { id: 'o', time: '15:00', days: [], onDate: '2026-10-21', label: '', enabled: true, sound: 'x', snoozeMin: 5, createdAt: 0 },
        { id: 'off', time: '15:00', days: [], onDate: '2026-10-21', label: '', enabled: false, sound: 'x', snoozeMin: 5, createdAt: 0 },
        { id: 's', time: '06:00', days: [], label: '', enabled: true, sound: 'x', snoozeMin: 5, snoozeUntil: now + 300000, createdAt: 0 },
      ] as Alarm[],
    }, now, 7);
    expect(plan.filter((p) => p.refId === 'w').map((p) => p.key.slice(4))).toEqual(
      ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28']);
    expect(plan.some((p) => p.key === 'a:o:2026-10-21')).toBe(true);
    expect(plan.some((p) => p.refId === 'off')).toBe(false);
    expect(plan[0].key).toBe('a:s:snz');
  });

  it('skips habits already done today', () => {
    const h = { id: 'h', name: 'Вода', emoji: '💧', color: '', days: [0, 1, 2, 3, 4, 5, 6], target: 1, unit: '', remindTime: '20:00',
      archived: false, order: 0, createdAt: 0, log: { '2026-10-21': 1 } } as Habit;
    const plan = planNotifications({ tasks: [], alarms: [], habits: [h] }, now, 3);
    expect(plan.map((p) => p.key)).toEqual(['h:h:2026-10-22', 'h:h:2026-10-23']);
  });

  it('respects the limit', () => {
    const alarms = Array.from({ length: 60 }, (_, i) => ({ id: 'a' + i, time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], label: '',
      enabled: true, sound: 'x', snoozeMin: 5, createdAt: 0 })) as Alarm[];
    expect(planNotifications({ tasks: [], habits: [], alarms }, now).length).toBe(400);
  });
});
