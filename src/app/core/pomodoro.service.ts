import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Data } from './data.service';
import { Notifier } from './notify.service';
import { SettingsService } from './settings.service';
import { SoundService } from './sound.service';
import { Ui } from './ui.service';
import { mmss, uid, vibrate } from './util';

export type Mode = 'focus' | 'short' | 'long';

interface State {
  mode: Mode;
  running: boolean;
  endsAt: number | null;
  /** ms left while paused; null = full duration */
  left: number | null;
  cycle: number;
  taskId: string | null;
  startedAt: number | null;
}

const KEY = 'ritm.pomodoro';
export const MODE_LABEL: Record<Mode, string> = { focus: 'Фокус', short: 'Короткий перерыв', long: 'Длинный перерыв' };

@Injectable({ providedIn: 'root' })
export class Pomodoro {
  private settings = inject(SettingsService);
  private data = inject(Data);
  private sound = inject(SoundService);
  private notifier = inject(Notifier);
  private ui = inject(Ui);

  readonly state = signal<State>(this.load());
  readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;
  private baseTitle = document.title;

  readonly total = computed(() => this.duration(this.state().mode));
  readonly remaining = computed(() => {
    const s = this.state();
    if (s.running && s.endsAt) return Math.max(0, s.endsAt - this.now());
    return s.left ?? this.total();
  });
  readonly progress = computed(() => 1 - this.remaining() / this.total());
  readonly label = computed(() => mmss(this.remaining()));
  readonly active = computed(() => this.state().running || this.state().left != null);
  readonly task = computed(() => this.data.tasks.get(this.state().taskId));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state()));
      } catch {}
    });
    effect(() => {
      const s = this.state();
      document.title = s.running ? `${this.label()} · ${s.mode === 'focus' ? '🍅' : '☕'} Ритм` : this.baseTitle;
    });
    const s = this.state();
    if (s.running) {
      if (s.endsAt && s.endsAt <= Date.now()) queueMicrotask(() => this.complete(true));
      else this.loop();
    }
  }

  private load(): State {
    const def: State = { mode: 'focus', running: false, endsAt: null, left: null, cycle: 0, taskId: null, startedAt: null };
    try {
      return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return def;
    }
  }

  duration(m: Mode) {
    const s = this.settings.s();
    return (m === 'focus' ? s.focusMin : m === 'short' ? s.shortMin : s.longMin) * 60000;
  }

  private loop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.state().running && this.remaining() <= 0) this.complete();
    }, 250);
  }

  start() {
    this.sound.unlock();
    const s = this.state();
    const left = s.left ?? this.duration(s.mode);
    this.now.set(Date.now());
    this.state.set({ ...s, running: true, endsAt: Date.now() + left, left: null, startedAt: s.startedAt ?? Date.now() });
    this.notifier.schedule('pomodoro', s.mode === 'focus' ? '🍅 Фокус завершён' : '☕ Перерыв окончен',
      'Открой Ритм, чтобы продолжить', Date.now() + left, '#/focus');
    this.loop();
  }

  pause() {
    const s = this.state();
    this.state.set({ ...s, running: false, left: this.remaining(), endsAt: null });
    clearInterval(this.timer);
    this.notifier.cancel('pomodoro');
  }

  toggle() {
    this.state().running ? this.pause() : this.start();
  }

  reset() {
    clearInterval(this.timer);
    this.notifier.cancel('pomodoro');
    this.state.update((s) => ({ ...s, running: false, endsAt: null, left: null, startedAt: null }));
  }

  setMode(mode: Mode) {
    clearInterval(this.timer);
    this.notifier.cancel('pomodoro');
    this.state.update((s) => ({ ...s, mode, running: false, endsAt: null, left: null, startedAt: null }));
  }

  setTask(taskId: string | null) {
    this.state.update((s) => ({ ...s, taskId }));
  }

  startForTask(taskId: string) {
    this.setMode('focus');
    this.setTask(taskId);
    this.start();
  }

  skip() {
    this.complete(true, true);
  }

  private complete(silent = false, skipped = false) {
    clearInterval(this.timer);
    const s = this.state();
    const st = this.settings.s();
    let cycle = s.cycle;
    let next: Mode;
    if (s.mode === 'focus') {
      if (!skipped) {
        const end = s.endsAt ?? Date.now();
        this.data.sessions.upsert({ id: uid(), start: s.startedAt ?? end - this.duration('focus'), end, minutes: st.focusMin, taskId: s.taskId ?? undefined });
        const t = this.data.tasks.get(s.taskId);
        if (t) this.data.tasks.patch(t.id, { pomodoros: (t.pomodoros || 0) + 1 });
      }
      cycle++;
      next = cycle % st.longEvery === 0 ? 'long' : 'short';
    } else {
      next = 'focus';
    }
    if (!skipped) {
      if (!silent) {
        this.sound.play('chime');
        if (st.vibrate) vibrate([300, 150, 300]);
      }
      const msg = s.mode === 'focus' ? 'Отличная работа! Время отдохнуть ☕' : 'Перерыв окончен — снова в бой 🍅';
      // in the Android app the notification scheduled in start() fires by itself
      if (!this.notifier.native) this.notifier.show(s.mode === 'focus' ? '🍅 Фокус завершён' : '☕ Перерыв окончен', msg, { tag: 'pomodoro', url: '#/focus' });
      this.ui.toast(msg);
    }
    this.state.set({ ...s, mode: next, cycle, running: false, endsAt: null, left: null, startedAt: null });
    const auto = next === 'focus' ? st.autoFocus : st.autoBreaks;
    if (auto && !skipped) this.start();
  }
}
