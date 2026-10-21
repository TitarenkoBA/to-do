import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Data, habitActive, habitDone } from './data.service';
import { Alarm, Task } from './models';
import { Notifier } from './notify.service';
import { SettingsService } from './settings.service';
import { SoundService } from './sound.service';
import { Ui } from './ui.service';
import { addDays, at, dateKey, parseKey, timeStr, todayKey, vibrate } from './util';

export interface Ringing {
  alarm?: Alarm;
  title: string;
  body: string;
}

const HABIT_FIRED = 'ritm.habitFired';

export function alarmNext(a: Alarm, now = Date.now()): number | null {
  if (!a.enabled) return null;
  if (a.snoozeUntil && a.snoozeUntil > now) return a.snoozeUntil;
  if (!a.days.length) {
    if (!a.onDate) return null;
    const ts = at(a.onDate, a.time);
    return ts > now - 15 * 60000 ? ts : null;
  }
  const today = dateKey(new Date(now));
  for (let i = 0; i < 8; i++) {
    const k = addDays(today, i);
    if (!a.days.includes(parseKey(k).getDay())) continue;
    const ts = at(k, a.time);
    if (ts > now) return ts;
  }
  return null;
}

/** Fires reminders, habit nudges and alarms while the app is alive. */
@Injectable({ providedIn: 'root' })
export class Scheduler {
  private data = inject(Data);
  private notifier = inject(Notifier);
  private sound = inject(SoundService);
  private ui = inject(Ui);
  private settings = inject(SettingsService);
  private router = inject(Router);

  readonly ringing = signal<Ringing | null>(null);
  readonly now = signal(Date.now());
  private vibTimer?: ReturnType<typeof setInterval>;

  readonly nextAlarm = computed(() => {
    const now = this.now();
    let best: { alarm: Alarm; ts: number } | null = null;
    for (const a of this.data.alarms.items()) {
      const ts = alarmNext(a, now);
      if (ts && ts > now && (!best || ts < best.ts)) best = { alarm: a, ts };
    }
    return best;
  });

  start() {
    const tick = () => {
      this.now.set(Date.now());
      this.check();
    };
    setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    tick();
  }

  private check() {
    const now = Date.now();
    const today = todayKey();
    const hm = timeStr();

    for (const t of this.data.tasks.items()) {
      if (t.done || !t.remindAt || t.remindAt > now) continue;
      if (t.remindedAt && t.remindedAt >= t.remindAt) continue;
      this.data.tasks.patch(t.id, { remindedAt: now });
      if (now - t.remindAt < 6 * 3600000) this.fireTask(t);
    }

    let fired: Record<string, string> = {};
    try {
      fired = JSON.parse(localStorage.getItem(HABIT_FIRED) || '{}');
    } catch {}
    let dirty = false;
    for (const h of this.data.habits.items()) {
      if (h.archived || !h.remindTime || fired[h.id] === today) continue;
      if (hm < h.remindTime || !habitActive(h, today) || habitDone(h, today)) continue;
      fired[h.id] = today;
      dirty = true;
      this.notifier.show(`${h.emoji} ${h.name}`, 'Пора выполнить привычку', { tag: 'habit-' + h.id, url: '#/habits' });
      this.ui.toast(`${h.emoji} Пора: ${h.name}`, { action: 'Открыть', fn: () => this.router.navigateByUrl('/habits') });
    }
    if (dirty) localStorage.setItem(HABIT_FIRED, JSON.stringify(fired));

    if (this.ringing()) return;
    for (const a of this.data.alarms.items()) {
      if (!a.enabled) continue;
      if (a.snoozeUntil) {
        if (now >= a.snoozeUntil) {
          this.data.alarms.patch(a.id, { snoozeUntil: undefined });
          this.ring(a);
          return;
        }
        continue;
      }
      const ok = a.days.length ? a.days.includes(new Date().getDay()) : a.onDate === today;
      const ts = at(today, a.time);
      const key = `${today} ${a.time}`;
      if (ok && now >= ts && now - ts < 15 * 60000 && a.lastFired !== key) {
        this.data.alarms.patch(a.id, { lastFired: key, enabled: a.days.length ? true : false });
        this.ring(a);
        return;
      }
    }
  }

  private fireTask(t: Task) {
    const when = t.time ? `в ${t.time}` : 'сегодня';
    this.notifier.show(`🔔 ${t.title}`, `Напоминание: ${when}`, { tag: 'task-' + t.id, url: '#/tasks' });
    this.sound.play(this.settings.s().reminderSound, 0.7);
    if (this.settings.s().vibrate) vibrate([120, 80, 120]);
    this.ui.toast(`🔔 ${t.title}`, { action: 'Открыть', fn: () => this.ui.openTask(t.id), ms: 10000 });
  }

  ring(a: Alarm) {
    this.ringing.set({ alarm: a, title: a.time, body: a.label || 'Будильник' });
    this.sound.ring(a.sound);
    this.notifier.show(`⏰ ${a.label || 'Будильник'}`, a.time, { tag: 'alarm-' + a.id, url: '#/alarms', sticky: true });
    if (this.settings.s().vibrate) {
      vibrate([600, 300, 600]);
      this.vibTimer = setInterval(() => vibrate([600, 300, 600]), 2000);
    }
  }

  stop() {
    this.sound.stopRing();
    clearInterval(this.vibTimer);
    vibrate(0);
    this.ringing.set(null);
  }

  snooze() {
    const a = this.ringing()?.alarm;
    if (a) {
      const until = Date.now() + a.snoozeMin * 60000;
      this.data.alarms.patch(a.id, { snoozeUntil: until, enabled: true });
      this.ui.toast(`Отложено на ${a.snoozeMin} мин`, { icon: 'alarm' });
    }
    this.stop();
  }
}
