import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Data } from '../core/data.service';
import { Alarm } from '../core/models';
import { Notifier } from '../core/notify.service';
import { Pwa } from '../core/pwa.service';
import { Scheduler, alarmNext } from '../core/scheduler.service';
import { SettingsService } from '../core/settings.service';
import { SOUNDS, SoundService } from '../core/sound.service';
import { Ui } from '../core/ui.service';
import { WEEKDAYS_SHORT, addDays, dateKey, daysLabel, fmtDuration, longDate, timeStr, todayKey, uid, vibrate, weekOrder } from '../core/util';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Empty, PageHeader } from '../shared/ui';

@Component({
  selector: 'app-alarms',
  imports: [Icon, Sheet, PageHeader, Empty],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Будильники">
        <button class="btn-icon" (click)="create()" aria-label="Новый будильник"><app-icon name="plus" /></button>
      </app-page-header>

      <section class="card mb-4 flex flex-col items-center gap-1 py-6 text-center">
        <div class="text-6xl font-extrabold tracking-tight tabular-nums">{{ clock() }}<span class="text-2xl text-muted">{{ secs() }}</span></div>
        <div class="text-sm text-muted first-letter:uppercase">{{ date() }}</div>
        @if (sched.nextAlarm(); as n) {
          <div class="mt-2 rounded-full bg-accent/12 px-3 py-1 text-sm font-semibold text-accent">⏰ {{ n.alarm.time }} · через {{ until(n.ts) }}</div>
        }
        <button class="btn btn-soft mt-4" (click)="bedside()"><app-icon name="bed" [size]="18" />Ночной режим</button>
      </section>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm font-semibold text-muted">Быстрый таймер:</span>
        @for (m of quick; track m) { <button class="chip" (click)="timer(m)">{{ m < 60 ? m + ' мин' : m / 60 + ' ч' }}</button> }
      </div>

      @if (!pwa.standalone() || notifier.permission() !== 'granted') {
        <div class="mb-4 flex gap-3 rounded-2xl border border-warn/30 bg-warn/8 p-3.5 text-sm">
          <span class="text-xl">💡</span>
          <div class="space-y-1">
            <p>Будильник звонит, пока Ритм открыт (можно в фоне). Для надёжного подъёма включи <b>Ночной режим</b> — экран не погаснет.</p>
            @if (notifier.permission() !== 'granted') {
              <button class="font-semibold text-accent" (click)="notifier.request()">Разрешить уведомления →</button>
            }
          </div>
        </div>
      }

      <div class="space-y-3">
        @for (a of alarms(); track a.id) {
          <div class="card flex items-center gap-4 transition" [class.opacity-55]="!a.enabled">
            <button class="min-w-0 flex-1 text-left" (click)="edit(a)">
              <div class="text-4xl font-bold tracking-tight tabular-nums">{{ a.time }}</div>
              <div class="truncate text-sm text-muted">{{ a.label || 'Будильник' }} · {{ days(a) }}
                @if (a.snoozeUntil) { · 💤 отложен }</div>
            </button>
            <input type="checkbox" class="switch" [checked]="a.enabled" (change)="toggle(a, $any($event.target).checked)" aria-label="Вкл/выкл" />
          </div>
        } @empty {
          <app-empty emoji="⏰" title="Нет будильников" text="Нажми +, чтобы завести первый" />
        }
      </div>
    </div>

    <app-sheet [open]="!!draft()" [title]="isNew() ? 'Новый будильник' : 'Будильник'" (closed)="draft.set(null)">
      @if (draft(); as d) {
        <div class="space-y-5 px-5 pb-6">
          <input type="time" class="w-full rounded-3xl bg-surface-2 py-4 text-center text-5xl font-bold tabular-nums outline-none" [value]="d.time"
            (change)="patch({ time: $any($event.target).value || d.time })" />
          <input class="input" placeholder="Название (например, «Подъём»)" [value]="d.label" (input)="patch({ label: $any($event.target).value })" />
          <div class="space-y-2">
            <div class="label">Повтор · {{ days(d) }}</div>
            <div class="grid grid-cols-7 gap-1.5">
              @for (w of order(); track w) {
                <button class="rounded-xl py-2 text-sm font-semibold transition" [class.bg-accent]="d.days.includes(w)" [class.text-white]="d.days.includes(w)"
                  [class.bg-surface-2]="!d.days.includes(w)" (click)="toggleDay(w)">{{ wd[w] }}</button>
              }
            </div>
          </div>
          <div class="space-y-2">
            <div class="label">Мелодия</div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              @for (s of sounds; track s.id) {
                <button class="chip justify-center" [class.chip-on]="d.sound === s.id" (click)="patch({ sound: s.id }); sound.play(s.id)">
                  <app-icon name="volume" [size]="14" />{{ s.name }}</button>
              }
            </div>
          </div>
          <div class="space-y-2">
            <div class="label">Отложить на</div>
            <div class="flex gap-2">
              @for (m of [5, 10, 15, 20]; track m) {
                <button class="chip flex-1 justify-center" [class.chip-on]="d.snoozeMin === m" (click)="patch({ snoozeMin: m })">{{ m }} мин</button>
              }
            </div>
          </div>
          <div class="flex gap-2">
            @if (!isNew()) { <button class="btn btn-ghost text-danger" (click)="remove(d)"><app-icon name="trash" [size]="16" />Удалить</button> }
            <button class="btn btn-ghost" (click)="test(d)">Проверить</button>
            <span class="flex-1"></span>
            <button class="btn btn-primary" (click)="save(d)">Сохранить</button>
          </div>
        </div>
      }
    </app-sheet>

    @if (night()) {
      <div class="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black text-white select-none anim-fade" (click)="dim.set(!dim())">
        <button class="absolute top-[max(env(safe-area-inset-top),16px)] right-4 grid size-11 place-items-center rounded-full bg-white/10" (click)="exitNight($event)" aria-label="Выйти">
          <app-icon name="x" /></button>
        <div class="transition-opacity duration-700" [class.opacity-30]="dim()">
          <div class="text-center text-[26vw] leading-none font-extralight tracking-tight tabular-nums md:text-[16vw]" style="color: color-mix(in srgb, var(--accent) 55%, #fff)">{{ clock() }}</div>
          <div class="mt-4 text-center text-lg text-white/50 first-letter:uppercase">{{ date() }}</div>
          @if (sched.nextAlarm(); as n) {
            <div class="mt-6 text-center text-white/70">⏰ {{ n.alarm.time }} · через {{ until(n.ts) }}</div>
          } @else {
            <div class="mt-6 text-center text-white/40">Будильник не заведён</div>
          }
        </div>
        <div class="absolute bottom-[max(env(safe-area-inset-bottom),24px)] text-xs text-white/30">
          {{ pwa.awake() ? 'Экран не погаснет · ' : '' }}коснись, чтобы приглушить
        </div>
      </div>
    }
  `,
})
export class Alarms implements OnDestroy {
  protected data = inject(Data);
  protected sched = inject(Scheduler);
  protected sound = inject(SoundService);
  protected pwa = inject(Pwa);
  protected notifier = inject(Notifier);
  private ui = inject(Ui);
  private settings = inject(SettingsService);
  protected readonly sounds = SOUNDS;
  protected readonly wd = WEEKDAYS_SHORT;
  protected readonly quick = [5, 10, 15, 30, 60];
  protected readonly draft = signal<Alarm | null>(null);
  protected readonly night = signal(false);
  protected readonly dim = signal(false);
  private readonly now = signal(new Date());
  private clockTimer = setInterval(() => this.now.set(new Date()), 1000);

  protected readonly clock = computed(() => timeStr(this.now()));
  protected readonly secs = computed(() => ':' + String(this.now().getSeconds()).padStart(2, '0'));
  protected readonly date = computed(() => longDate(todayKey()));
  protected readonly alarms = computed(() =>
    [...this.data.alarms.items()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)),
  );
  protected readonly isNew = computed(() => !this.data.alarms.get(this.draft()?.id));
  protected readonly order = computed(() => weekOrder(this.settings.s().weekStart));

  days = (a: Alarm) => daysLabel(a.days, this.settings.s().weekStart);
  until = (ts: number) => fmtDuration(ts - this.now().getTime());

  private onDate(time: string) {
    return time > timeStr() ? todayKey() : addDays(todayKey(), 1);
  }

  create() {
    this.sound.unlock();
    this.draft.set({ id: uid(), time: '07:00', days: [], label: '', enabled: true, sound: 'sunrise', snoozeMin: 5, createdAt: Date.now() });
  }

  edit(a: Alarm) {
    this.draft.set({ ...a });
  }

  patch(p: Partial<Alarm>) {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  toggleDay(w: number) {
    const d = this.draft()!;
    this.patch({ days: d.days.includes(w) ? d.days.filter((x) => x !== w) : [...d.days, w] });
  }

  save(d: Alarm) {
    const a: Alarm = { ...d, enabled: true, snoozeUntil: undefined, lastFired: undefined, onDate: d.days.length ? undefined : this.onDate(d.time) };
    this.data.alarms.upsert(a);
    this.draft.set(null);
    this.announce(a);
    if (this.notifier.permission() === 'default') this.notifier.request();
  }

  toggle(a: Alarm, on: boolean) {
    vibrate(10);
    this.sound.unlock();
    const next = { ...a, enabled: on, snoozeUntil: undefined, onDate: a.days.length ? undefined : this.onDate(a.time) };
    this.data.alarms.upsert(next);
    if (on) this.announce(next);
  }

  private announce(a: Alarm) {
    const ts = alarmNext(a);
    if (ts) this.ui.toast(`Зазвонит через ${fmtDuration(ts - Date.now())}`, { icon: 'alarm' });
  }

  timer(min: number) {
    this.sound.unlock();
    const d = new Date(Date.now() + min * 60000);
    const a: Alarm = { id: uid(), time: timeStr(d), days: [], label: `Таймер ${min < 60 ? min + ' мин' : min / 60 + ' ч'}`, enabled: true,
      sound: 'chime', snoozeMin: 5, onDate: dateKey(d),
      createdAt: Date.now() };
    this.data.alarms.upsert(a);
    this.ui.toast(`⏱️ Таймер на ${timeStr(d)}`);
  }

  test(d: Alarm) {
    this.draft.set(null);
    this.sched.ring(d);
  }

  async remove(a: Alarm) {
    this.draft.set(null);
    this.data.alarms.remove(a.id);
    this.ui.toast('Будильник удалён', { action: 'Вернуть', fn: () => this.data.alarms.upsert(a) });
  }

  async bedside() {
    this.sound.unlock();
    this.night.set(true);
    this.dim.set(false);
    const ok = await this.pwa.keepAwake(true);
    if (!ok) this.ui.toast('Браузер не поддерживает блокировку сна экрана');
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {}
  }

  exitNight(e: Event) {
    e.stopPropagation();
    this.night.set(false);
    this.pwa.keepAwake(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  ngOnDestroy() {
    clearInterval(this.clockTimer);
    if (this.night()) this.pwa.keepAwake(false);
  }
}
