import { Injectable, computed, inject, signal } from '@angular/core';
import { Collection, Db } from './db';
import { Alarm, FocusSession, Habit, JournalEntry, Note, Task, TaskList } from './models';
import { addDays, addMonths, at, dateKey, diffDays, parseKey, todayKey, uid } from './util';

export const INBOX = 'inbox';

@Injectable({ providedIn: 'root' })
export class Data {
  private db = inject(Db);
  readonly tasks = new Collection<Task>(this.db, 'tasks');
  readonly lists = new Collection<TaskList>(this.db, 'lists');
  readonly notes = new Collection<Note>(this.db, 'notes');
  readonly journal = new Collection<JournalEntry>(this.db, 'journal');
  readonly habits = new Collection<Habit>(this.db, 'habits');
  readonly alarms = new Collection<Alarm>(this.db, 'alarms');
  readonly sessions = new Collection<FocusSession>(this.db, 'sessions');
  readonly all = [this.tasks, this.lists, this.notes, this.journal, this.habits, this.alarms, this.sessions];

  readonly ready = signal(false);
  /** ticks every minute so date-dependent computeds refresh past midnight */
  readonly today = signal(todayKey());

  readonly sortedLists = computed(() =>
    [...this.lists.items()].sort((a, b) => a.order - b.order),
  );

  async init() {
    try {
      await Promise.all(this.all.map((c) => c.load()));
      if (!this.lists.get(INBOX)) await this.seed();
    } catch (e) {
      console.error('DB init failed', e);
    }
    setInterval(() => {
      const t = todayKey();
      if (t !== this.today()) this.today.set(t);
    }, 30000);
    this.ready.set(true);
  }

  private async seed() {
    const now = Date.now();
    await this.lists.upsert({ id: INBOX, name: 'Входящие', emoji: '📥', color: '#7c5cff', order: 0, createdAt: now });
    await this.lists.upsert({ id: uid(), name: 'Личное', emoji: '🏡', color: '#10b981', order: 1, createdAt: now });
    await this.lists.upsert({ id: uid(), name: 'Работа', emoji: '💼', color: '#3b82f6', order: 2, createdAt: now });
    const t = todayKey();
    const demo: Partial<Task>[] = [
      { title: 'Попробуй быстрый ввод: «Позвонить маме завтра в 19:00 #семья !1»', due: t, priority: 3 },
      { title: 'Смахни задачу вправо — выполнено, влево — удалить', due: t, priority: 2 },
      { title: 'Открой задачу: подзадачи, фото, голосовые и напоминания', due: t, priority: 1,
        subtasks: [
          { id: uid(), title: 'Добавить подзадачу', done: true },
          { id: uid(), title: 'Прикрепить фото или аудио', done: false },
        ] },
      { title: 'Запусти помодоро-таймер на 25 минут', due: addDays(t, 1), tags: ['фокус'] },
    ];
    for (const [i, d] of demo.entries()) await this.tasks.upsert(this.newTask({ ...d, order: i }));
    const hab: [string, string, string, number, string][] = [
      ['Вода', '💧', '#06b6d4', 8, 'стак.'],
      ['Зарядка', '🤸', '#f97316', 1, ''],
      ['Чтение', '📚', '#a855f7', 1, ''],
    ];
    for (const [i, [name, emoji, color, target, unit]] of hab.entries()) {
      await this.habits.upsert({ id: uid(), name, emoji, color, target, unit, days: [0, 1, 2, 3, 4, 5, 6],
        archived: false, order: i, log: {}, createdAt: now });
    }
    await this.alarms.upsert({ id: uid(), time: '07:30', days: [1, 2, 3, 4, 5], label: 'Подъём', enabled: false,
      sound: 'sunrise', snoozeMin: 5, createdAt: now });
  }

  // ---------- tasks ----------

  newTask(p: Partial<Task> = {}): Task {
    const now = Date.now();
    const t: Task = {
      id: uid(), title: '', notes: '', listId: INBOX, done: false, remind: null, repeat: 'none',
      priority: 0, tags: [], subtasks: [], attachments: [], pomodoros: 0,
      order: now, createdAt: now, updatedAt: now, ...p,
    };
    t.remindAt = remindAt(t);
    return t;
  }

  saveTask(t: Task) {
    const next = { ...t, updatedAt: Date.now() };
    const ra = remindAt(next);
    if (ra !== next.remindAt) next.remindedAt = undefined;
    next.remindAt = ra;
    return this.tasks.upsert(next);
  }

  /** Toggle completion; repeating tasks roll forward and leave a completed copy. Returns next due if rolled. */
  toggleTask(id: string): string | undefined {
    const t = this.tasks.get(id);
    if (!t) return;
    if (!t.done && t.repeat !== 'none' && t.due) {
      const done = { ...t, id: uid(), done: true, completedAt: Date.now(), repeat: 'none' as const, remind: null, remindAt: undefined };
      this.tasks.upsert(done);
      let next = nextOccurrence(t.due, t.repeat);
      const today = todayKey();
      while (next < today) next = nextOccurrence(next, t.repeat);
      this.saveTask({ ...t, due: next, subtasks: t.subtasks.map((s) => ({ ...s, done: false })), remindedAt: undefined });
      return next;
    }
    this.saveTask({ ...t, done: !t.done, completedAt: t.done ? undefined : Date.now() });
    return;
  }

  // ---------- habits ----------

  habitCount(h: Habit, key: string) {
    return h.log[key] ?? 0;
  }

  bumpHabit(h: Habit, key: string, delta = 1) {
    const cur = this.habitCount(h, key);
    let next = cur + delta;
    if (next > h.target) next = 0;
    if (next < 0) next = 0;
    const log = { ...h.log, [key]: next };
    if (!next) delete log[key];
    this.habits.upsert({ ...h, log });
    return next;
  }
}

export function remindAt(t: Task): number | undefined {
  if (t.remind == null || !t.due || t.done) return undefined;
  return at(t.due, t.time || '09:00') - t.remind * 60000;
}

export function nextOccurrence(key: string, r: Task['repeat']): string {
  switch (r) {
    case 'daily':
      return addDays(key, 1);
    case 'weekdays': {
      let k = addDays(key, 1);
      while ([0, 6].includes(parseKey(k).getDay())) k = addDays(k, 1);
      return k;
    }
    case 'weekly':
      return addDays(key, 7);
    case 'monthly':
      return addMonths(key, 1);
    case 'yearly':
      return addMonths(key, 12);
    default:
      return key;
  }
}

/** Does a (possibly repeating) task fall on a given day? */
export function occursOn(t: Task, key: string): boolean {
  if (!t.due) return false;
  if (t.due === key) return true;
  if (t.done || t.repeat === 'none' || key < t.due) return false;
  const a = parseKey(t.due);
  const b = parseKey(key);
  switch (t.repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return b.getDay() > 0 && b.getDay() < 6;
    case 'weekly':
      return diffDays(key, t.due) % 7 === 0;
    case 'monthly':
      return a.getDate() === b.getDate();
    case 'yearly':
      return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  }
  return false;
}

export const habitActive = (h: Habit, key: string) => h.days.includes(parseKey(key).getDay());
export const habitDone = (h: Habit, key: string) => (h.log[key] ?? 0) >= h.target;

export function habitStreak(h: Habit, today = todayKey()): number {
  let k = habitDone(h, today) ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    if (habitActive(h, k)) {
      if (!habitDone(h, k)) break;
      n++;
    }
    k = addDays(k, -1);
    if (k < todayKeyOf(h.createdAt) && !habitDone(h, k)) break;
  }
  return n;
}

export function habitBest(h: Habit): number {
  const keys = Object.keys(h.log).filter((k) => habitDone(h, k)).sort();
  if (!keys.length) return 0;
  let best = 0;
  let cur = 0;
  let k = keys[0];
  const end = keys[keys.length - 1];
  while (k <= end) {
    if (habitActive(h, k)) {
      if (habitDone(h, k)) best = Math.max(best, ++cur);
      else cur = 0;
    }
    k = addDays(k, 1);
  }
  return best;
}

export function habitRate(h: Habit, days = 30, today = todayKey()): number {
  let active = 0;
  let done = 0;
  const start = todayKeyOf(h.createdAt);
  for (let i = 0; i < days; i++) {
    const k = addDays(today, -i);
    if (k < start) break;
    if (!habitActive(h, k)) continue;
    active++;
    if (habitDone(h, k)) done++;
  }
  return active ? done / active : 0;
}

const todayKeyOf = (ts: number) => dateKey(new Date(ts));

export function newNote(p: Partial<Note> = {}): Note {
  return { id: uid(), title: '', body: '', color: '', pinned: false, archived: false, tags: [], checklist: [], attachments: [],
    createdAt: Date.now(), updatedAt: Date.now(), ...p };
}

export function newEntry(date: string, p: Partial<JournalEntry> = {}): JournalEntry {
  return { id: uid(), date, mood: 0, title: '', body: '', tags: [], attachments: [], createdAt: Date.now(), updatedAt: Date.now(), ...p };
}
