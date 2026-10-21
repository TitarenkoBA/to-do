import { Injectable, effect, signal } from '@angular/core';

export interface Settings {
  name: string;
  theme: 'system' | 'light' | 'dark';
  accent: string;
  weekStart: 0 | 1;
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;
  autoBreaks: boolean;
  autoFocus: boolean;
  focusGoal: number;
  defaultRemind: number | null;
  reminderSound: string;
  vibrate: boolean;
  onboarded: boolean;
}

const DEFAULTS: Settings = {
  name: '',
  theme: 'system',
  accent: '#7c5cff',
  weekStart: 1,
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoBreaks: true,
  autoFocus: false,
  focusGoal: 8,
  defaultRemind: 0,
  reminderSound: 'chime',
  vibrate: true,
  onboarded: false,
};

const KEY = 'ritm.settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly s = signal<Settings>(this.read());
  readonly dark = signal(false);
  private mq = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.mq.addEventListener('change', () => this.apply(this.s()));
    effect(() => {
      const s = this.s();
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {}
      this.apply(s);
    });
  }

  private read(): Settings {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.s.update((s) => ({ ...s, [key]: value }));
  }

  replace(s: Partial<Settings>) {
    this.s.set({ ...DEFAULTS, ...s });
  }

  private apply(s: Settings) {
    const dark = s.theme === 'dark' || (s.theme === 'system' && this.mq.matches);
    this.dark.set(dark);
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.setProperty('--accent', s.accent);
    root.style.colorScheme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#0f0f14' : '#f6f5fb');
  }
}
