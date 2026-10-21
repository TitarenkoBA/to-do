export type ID = string;

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export interface Attachment {
  id: ID;
  kind: MediaKind;
  mime: string;
  name?: string;
  size: number;
  duration?: number;
  createdAt: number;
}

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type Priority = 0 | 1 | 2 | 3;

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task {
  id: ID;
  title: string;
  notes: string;
  listId: ID;
  done: boolean;
  completedAt?: number;
  /** YYYY-MM-DD */
  due?: string;
  /** HH:mm */
  time?: string;
  /** minutes before due moment; null = no reminder */
  remind: number | null;
  remindAt?: number;
  remindedAt?: number;
  repeat: Repeat;
  priority: Priority;
  tags: string[];
  subtasks: Subtask[];
  attachments: Attachment[];
  pomodoros: number;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskList {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  order: number;
  createdAt: number;
}

export interface Note {
  id: ID;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  tags: string[];
  checklist: Subtask[];
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
}

export type Mood = 1 | 2 | 3 | 4 | 5;

export interface JournalEntry {
  id: ID;
  date: string;
  mood: Mood | 0;
  title: string;
  body: string;
  tags: string[];
  attachments: Attachment[];
  createdAt: number;
  updatedAt: number;
}

export interface Habit {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  /** active weekdays, 0 = Sunday */
  days: number[];
  target: number;
  unit: string;
  remindTime?: string;
  archived: boolean;
  order: number;
  /** date -> count */
  log: Record<string, number>;
  createdAt: number;
}

export interface Alarm {
  id: ID;
  time: string;
  /** empty = one-shot */
  days: number[];
  label: string;
  enabled: boolean;
  sound: string;
  snoozeMin: number;
  snoozeUntil?: number;
  lastFired?: string;
  /** date for a one-shot alarm */
  onDate?: string;
  createdAt: number;
}

export interface FocusSession {
  id: ID;
  start: number;
  end: number;
  minutes: number;
  taskId?: ID;
}
