import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Data } from '../core/data.service';
import { MODE_LABEL, Mode, Pomodoro } from '../core/pomodoro.service';
import { Pwa } from '../core/pwa.service';
import { Settings, SettingsService } from '../core/settings.service';
import { AMBIENT, SoundService } from '../core/sound.service';
import { sortTasks } from '../core/task-actions.service';
import { WEEKDAYS_SHORT, addDays, dateKey, parseKey } from '../core/util';
import { Icon } from '../shared/icon';
import { Ring } from '../shared/ring';
import { Sheet } from '../shared/sheet';
import { PageHeader } from '../shared/ui';

@Component({
  selector: 'app-focus',
  imports: [Icon, Ring, Sheet, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Фокус" sub="Метод помидора">
        <button class="btn-icon" (click)="zen()" aria-label="Режим погружения" title="Режим погружения"><app-icon name="expand" /></button>
        <button class="btn-icon" (click)="settingsOpen.set(true)" aria-label="Настройки"><app-icon name="sliders" /></button>
      </app-page-header>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section class="card flex flex-col items-center gap-6 py-6">
          <div class="flex rounded-2xl bg-surface-2 p-1 text-sm font-semibold">
            @for (m of modes; track m) {
              <button class="rounded-xl px-3 py-2 transition sm:px-4" [class.bg-surface]="p.state().mode === m" [class.shadow-sm]="p.state().mode === m"
                [class.text-muted]="p.state().mode !== m" (click)="p.setMode(m)">{{ short[m] }}</button>
            }
          </div>

          <app-ring [value]="p.progress()" [size]="ringSize" [width]="14" [color]="p.state().mode === 'focus' ? 'var(--accent)' : 'var(--ok)'">
            <div class="flex flex-col items-center">
              <span class="text-6xl font-extrabold tracking-tight tabular-nums sm:text-7xl" [class.animate-pulse]="!p.state().running && p.active()">{{ p.label() }}</span>
              <span class="mt-1 text-sm font-medium text-muted">{{ label[p.state().mode] }}</span>
              <div class="mt-3 flex gap-1.5">
                @for (i of cycleDots(); track $index) {
                  <span class="size-2 rounded-full" [class.bg-accent]="i" [class.bg-line]="!i"></span>
                }
              </div>
            </div>
          </app-ring>

          <div class="flex items-center gap-5">
            <button class="btn-icon size-12 bg-surface-2" (click)="p.reset()" aria-label="Сбросить"><app-icon name="reset" /></button>
            <button class="grid size-20 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 transition active:scale-95"
              (click)="p.toggle()" [attr.aria-label]="p.state().running ? 'Пауза' : 'Старт'">
              <app-icon [name]="p.state().running ? 'pause' : 'play'" [size]="32" [fill]="true" [stroke]="0" />
            </button>
            <button class="btn-icon size-12 bg-surface-2" (click)="p.skip()" aria-label="Пропустить"><app-icon name="skip" /></button>
          </div>

          <button class="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-accent"
            (click)="pickOpen.set(true)">
            <app-icon name="target" class="text-accent" />
            <span class="min-w-0 flex-1 truncate" [class.text-muted]="!p.task()">{{ p.task()?.title ?? 'Над чем работаем?' }}</span>
            @if (p.task()?.pomodoros) { <span class="text-sm">🍅{{ p.task()!.pomodoros }}</span> }
            <app-icon name="chevron-right" [size]="16" class="text-muted" />
          </button>
        </section>

        <aside class="space-y-4">
          <section class="card">
            <div class="mb-3 flex items-center gap-2"><app-icon name="headphones" [size]="18" class="text-accent" /><h2 class="flex-1 font-semibold">Звуки для фокуса</h2></div>
            <div class="grid grid-cols-3 gap-2">
              <button class="ambient" [class.ambient-on]="!sound.ambient()" (click)="sound.setAmbient(null)"><span class="text-xl">🔇</span>Тишина</button>
              @for (a of ambient; track a.id) {
                <button class="ambient" [class.ambient-on]="sound.ambient() === a.id" (click)="sound.setAmbient(a.id)"><span class="text-xl">{{ a.emoji }}</span>{{ a.name }}</button>
              }
            </div>
            @if (sound.ambient()) {
              <label class="mt-3 flex items-center gap-3 anim-fade"><app-icon name="volume" [size]="18" class="text-muted" />
                <input type="range" min="0.05" max="1" step="0.05" class="flex-1 accent-[var(--accent)]" [value]="sound.ambientVolume()"
                  (input)="sound.setAmbientVolume(+$any($event.target).value)" />
              </label>
            }
          </section>

          <section class="card">
            <div class="mb-1 flex items-baseline justify-between">
              <h2 class="font-semibold">Сегодня</h2>
              <span class="text-sm text-muted">цель {{ s().focusGoal }} 🍅</span>
            </div>
            <div class="mb-3 flex items-baseline gap-2">
              <span class="text-3xl font-extrabold">{{ todayCount() }}</span><span class="text-muted">🍅 · {{ todayMin() }} мин</span>
            </div>
            <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent transition-all" [style.width.%]="goalPct()"></div></div>
            <div class="flex h-28 items-end gap-2">
              @for (d of week(); track d.key) {
                <div class="flex flex-1 flex-col items-center gap-1">
                  <span class="text-[10px] text-muted">{{ d.min || '' }}</span>
                  <div class="w-full rounded-lg transition-all" [style.height.px]="4 + (d.min / maxMin()) * 70"
                    [class]="d.today ? 'bg-accent' : 'bg-accent/35'"></div>
                  <span class="text-[11px] font-medium" [class.text-accent]="d.today" [class.text-muted]="!d.today">{{ d.label }}</span>
                </div>
              }
            </div>
            <p class="mt-3 text-center text-xs text-muted">Всего: {{ totalHours() }} ч фокуса · {{ data.sessions.items().length }} помидоров</p>
          </section>
        </aside>
      </div>
    </div>

    @if (zenOn()) {
      <div class="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-8 bg-bg anim-fade" (dblclick)="exitZen()">
        <button class="btn-icon absolute top-[max(var(--sa-top),16px)] right-4" (click)="exitZen()" aria-label="Выйти"><app-icon name="x" /></button>
        <div class="text-sm font-semibold tracking-[.3em] text-muted uppercase">{{ label[p.state().mode] }}</div>
        <div class="text-[22vw] leading-none font-extrabold tabular-nums md:text-[14vw]">{{ p.label() }}</div>
        @if (p.task(); as t) { <div class="max-w-md px-6 text-center text-lg text-muted">{{ t.title }}</div> }
        <div class="h-1 w-2/3 max-w-md overflow-hidden rounded-full bg-surface-2"><div class="h-full bg-accent transition-all" [style.width.%]="p.progress() * 100"></div></div>
        <button class="grid size-16 place-items-center rounded-full bg-accent text-white" (click)="p.toggle()">
          <app-icon [name]="p.state().running ? 'pause' : 'play'" [size]="26" [fill]="true" [stroke]="0" />
        </button>
      </div>
    }

    <app-sheet [open]="pickOpen()" title="Выбери задачу" (closed)="pickOpen.set(false)">
      <div class="space-y-1 px-3 pb-6">
        <button class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2" (click)="pick(null)">
          <app-icon name="x" [size]="18" class="text-muted" />Без задачи</button>
        @for (t of openTasks(); track t.id) {
          <button class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2" [class]="p.state().taskId === t.id ? 'bg-accent/10' : ''" (click)="pick(t.id)">
            <span class="size-2 shrink-0 rounded-full bg-accent"></span><span class="min-w-0 flex-1 truncate">{{ t.title }}</span>
            @if (t.pomodoros) { <span class="text-sm text-muted">🍅{{ t.pomodoros }}</span> }
          </button>
        }
      </div>
    </app-sheet>

    <app-sheet [open]="settingsOpen()" title="Настройки таймера" (closed)="settingsOpen.set(false)">
      <div class="space-y-1 px-5 pb-6">
        @for (f of fields; track f.key) {
          <div class="flex items-center gap-3 py-2">
            <span class="flex-1">{{ f.label }}</span>
            <button class="btn-icon bg-surface-2" (click)="step(f.key, -f.step, f.min, f.max)">−</button>
            <span class="w-14 text-center font-bold tabular-nums">{{ s()[f.key] }}{{ f.unit }}</span>
            <button class="btn-icon bg-surface-2" (click)="step(f.key, f.step, f.min, f.max)">+</button>
          </div>
        }
        <label class="flex items-center gap-3 py-3"><span class="flex-1">Автостарт перерыва</span>
          <input type="checkbox" class="switch" [checked]="s().autoBreaks" (change)="settings.set('autoBreaks', $any($event.target).checked)" /></label>
        <label class="flex items-center gap-3 py-3"><span class="flex-1">Автостарт фокуса после перерыва</span>
          <input type="checkbox" class="switch" [checked]="s().autoFocus" (change)="settings.set('autoFocus', $any($event.target).checked)" /></label>
      </div>
    </app-sheet>
  `,
})
export class Focus {
  protected p = inject(Pomodoro);
  protected data = inject(Data);
  protected sound = inject(SoundService);
  protected settings = inject(SettingsService);
  private pwa = inject(Pwa);
  protected s = this.settings.s;
  protected readonly modes: Mode[] = ['focus', 'short', 'long'];
  protected readonly short: Record<Mode, string> = { focus: 'Фокус', short: 'Перерыв', long: 'Длинный' };
  protected readonly label = MODE_LABEL;
  protected readonly ambient = AMBIENT;
  protected readonly pickOpen = signal(false);
  protected readonly settingsOpen = signal(false);
  protected readonly zenOn = signal(false);
  protected readonly ringSize = Math.min(300, Math.round(window.innerWidth * 0.72));
  protected readonly fields: { key: keyof Settings & ('focusMin' | 'shortMin' | 'longMin' | 'longEvery' | 'focusGoal'); label: string; step: number; min: number; max: number; unit: string }[] = [
    { key: 'focusMin', label: 'Фокус', step: 5, min: 5, max: 120, unit: 'м' },
    { key: 'shortMin', label: 'Короткий перерыв', step: 1, min: 1, max: 30, unit: 'м' },
    { key: 'longMin', label: 'Длинный перерыв', step: 5, min: 5, max: 60, unit: 'м' },
    { key: 'longEvery', label: 'Длинный перерыв каждые', step: 1, min: 2, max: 8, unit: '' },
    { key: 'focusGoal', label: 'Цель помидоров в день', step: 1, min: 1, max: 20, unit: '' },
  ];

  protected readonly cycleDots = computed(() => {
    const n = this.s().longEvery;
    const c = this.p.state().cycle % n;
    return Array.from({ length: n }, (_, i) => i < c);
  });
  protected readonly openTasks = computed(() => this.data.tasks.items().filter((t) => !t.done).sort(sortTasks));
  private readonly todaySessions = computed(() => {
    const start = new Date(this.data.today() + 'T00:00').getTime();
    return this.data.sessions.items().filter((x) => x.end >= start);
  });
  protected readonly todayCount = computed(() => this.todaySessions().length);
  protected readonly todayMin = computed(() => this.todaySessions().reduce((a, x) => a + x.minutes, 0));
  protected readonly goalPct = computed(() => Math.min(100, (this.todayCount() / this.s().focusGoal) * 100));
  protected readonly week = computed(() => {
    const t = this.data.today();
    const by = new Map<string, number>();
    for (const x of this.data.sessions.items()) {
      const k = dateKey(new Date(x.end));
      by.set(k, (by.get(k) ?? 0) + x.minutes);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(t, i - 6);
      return { key, min: by.get(key) ?? 0, label: WEEKDAYS_SHORT[parseKey(key).getDay()], today: key === t };
    });
  });
  protected readonly maxMin = computed(() => Math.max(60, ...this.week().map((d) => d.min)));
  protected readonly totalHours = computed(() => Math.round(this.data.sessions.items().reduce((a, x) => a + x.minutes, 0) / 6) / 10);

  pick(id: string | null) {
    this.p.setTask(id);
    this.pickOpen.set(false);
  }

  step(key: 'focusMin' | 'shortMin' | 'longMin' | 'longEvery' | 'focusGoal', d: number, min: number, max: number) {
    this.settings.set(key, Math.min(max, Math.max(min, this.s()[key] + d)));
  }

  async zen() {
    this.zenOn.set(true);
    this.pwa.keepAwake(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {}
  }

  exitZen() {
    this.zenOn.set(false);
    this.pwa.keepAwake(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}
