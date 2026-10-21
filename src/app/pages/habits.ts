import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Data, habitActive, habitBest, habitDone, habitRate, habitStreak } from '../core/data.service';
import { Habit } from '../core/models';
import { Notifier } from '../core/notify.service';
import { SettingsService } from '../core/settings.service';
import { Ui } from '../core/ui.service';
import { PALETTE, WEEKDAYS_SHORT, addDays, daysLabel, parseKey, uid, vibrate, weekOrder } from '../core/util';
import { Icon } from '../shared/icon';
import { Ring } from '../shared/ring';
import { Sheet } from '../shared/sheet';
import { EMOJIS, Empty, PageHeader } from '../shared/ui';

const TEMPLATES: [string, string, string, number, string][] = [
  ['Пить воду', '💧', '#06b6d4', 8, 'стак.'],
  ['Зарядка', '🤸', '#f97316', 1, ''],
  ['Чтение', '📚', '#a855f7', 1, ''],
  ['Медитация', '🧘', '#10b981', 1, ''],
  ['10 000 шагов', '🚶', '#84cc16', 1, ''],
  ['Без сладкого', '🍎', '#ef4444', 1, ''],
  ['Сон до 23:00', '😴', '#3b82f6', 1, ''],
  ['Витамины', '💊', '#f59e0b', 1, ''],
  ['Английский', '🗣️', '#ec4899', 1, ''],
  ['Дневник', '✍️', '#7c5cff', 1, ''],
];

@Component({
  selector: 'app-habits',
  imports: [Icon, PageHeader, Sheet, Ring, Empty],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Привычки" [sub]="doneToday() + ' из ' + activeToday() + ' сегодня'">
        <button class="btn-icon" (click)="create()" aria-label="Новая привычка"><app-icon name="plus" /></button>
      </app-page-header>

      @if (habits().length) {
        <div class="space-y-3">
          @for (h of habits(); track h.id) {
            <div class="card p-3.5">
              <button class="mb-3 flex w-full items-center gap-3 text-left" (click)="detail.set(h.id)">
                <span class="grid size-11 shrink-0 place-items-center rounded-2xl text-2xl" [style.background]="h.color + '22'">{{ h.emoji }}</span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-semibold">{{ h.name }}</div>
                  <div class="text-xs text-muted">{{ days(h) }}@if (h.target > 1) { · {{ h.target }} {{ h.unit }} в день }@if (h.remindTime) { · 🔔 {{ h.remindTime }} }</div>
                </div>
                @if (streak(h); as s) { <span class="rounded-full bg-orange-500/12 px-2.5 py-1 text-sm font-bold text-orange-500">🔥 {{ s }}</span> }
              </button>
              <div class="grid grid-cols-7 gap-1.5">
                @for (d of week(); track d.key) {
                  @let cnt = count(h, d.key);
                  @let on = active(h, d.key);
                  <button class="flex flex-col items-center gap-1 disabled:opacity-30" [disabled]="!on || d.future" (click)="bump(h, d.key)">
                    <span class="text-[10px] font-semibold uppercase" [class.text-accent]="d.today" [class.text-muted]="!d.today">{{ d.label }}</span>
                    <app-ring [value]="cnt / h.target" [size]="38" [width]="4" [color]="h.color">
                      @if (cnt >= h.target) {
                        <span class="grid size-[30px] place-items-center rounded-full text-white anim-pop" [style.background]="h.color"><app-icon name="check" [size]="16" [stroke]="3" /></span>
                      } @else {
                        <span class="text-xs font-semibold" [class.text-muted]="!cnt">{{ h.target > 1 ? cnt : d.day }}</span>
                      }
                    </app-ring>
                  </button>
                }
              </div>
            </div>
          }
        </div>
      } @else {
        <app-empty emoji="🌱" title="Начни с маленького шага" text="Выбери шаблон или создай свою привычку" />
      }

      <h2 class="section-title mt-8">Идеи</h2>
      <div class="flex flex-wrap gap-2">
        @for (t of templates; track t[0]) {
          <button class="chip" (click)="fromTemplate(t)">{{ t[1] }} {{ t[0] }}</button>
        }
      </div>
    </div>

    <app-sheet [open]="!!detailHabit()" [title]="detailHabit() ? detailHabit()!.emoji + ' ' + detailHabit()!.name : ''" (closed)="detail.set(null)">
      @if (detailHabit(); as h) {
        <div class="space-y-5 px-5 pb-6">
          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="rounded-2xl bg-surface-2 p-2"><div class="text-xl font-bold">🔥{{ streak(h) }}</div><div class="text-[11px] text-muted">серия</div></div>
            <div class="rounded-2xl bg-surface-2 p-2"><div class="text-xl font-bold">{{ best(h) }}</div><div class="text-[11px] text-muted">рекорд</div></div>
            <div class="rounded-2xl bg-surface-2 p-2"><div class="text-xl font-bold">{{ rate(h) }}%</div><div class="text-[11px] text-muted">за 30 дн.</div></div>
            <div class="rounded-2xl bg-surface-2 p-2"><div class="text-xl font-bold">{{ total(h) }}</div><div class="text-[11px] text-muted">всего</div></div>
          </div>
          <div class="overflow-x-auto no-scrollbar">
            <div class="mx-auto grid w-max grid-flow-col grid-rows-7 gap-[3px]">
              @for (c of heat(h); track c.key) {
                <span class="size-3.5 rounded-[3px] sm:size-4" [title]="c.key"
                  [style.background]="c.future ? 'transparent' : c.v ? 'color-mix(in srgb, ' + h.color + ' ' + (25 + c.v * 75) + '%, transparent)' : 'var(--surface-2)'"></span>
              }
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-soft flex-1" (click)="edit(h)"><app-icon name="edit" [size]="16" />Изменить</button>
            <button class="btn btn-ghost" (click)="archive(h)"><app-icon name="archive" [size]="16" /></button>
            <button class="btn btn-ghost text-danger" (click)="remove(h)"><app-icon name="trash" [size]="16" /></button>
          </div>
        </div>
      }
    </app-sheet>

    <app-sheet [open]="!!draft()" [title]="isNew() ? 'Новая привычка' : 'Привычка'" (closed)="draft.set(null)">
      @if (draft(); as d) {
        <div class="space-y-5 px-5 pb-6">
          <div class="flex gap-2">
            <span class="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" [style.background]="d.color + '22'">{{ d.emoji }}</span>
            <input class="input flex-1" placeholder="Например, «Медитация»" [value]="d.name" (input)="patch({ name: $any($event.target).value })" />
          </div>
          <div class="grid grid-cols-9 gap-1 sm:grid-cols-12">
            @for (e of emojis; track e) {
              <button class="grid aspect-square place-items-center rounded-xl text-xl transition hover:bg-surface-2"
                [class.bg-surface-2]="d.emoji === e" [class.ring-2]="d.emoji === e" [class.ring-accent]="d.emoji === e" (click)="patch({ emoji: e })">{{ e }}</button>
            }
          </div>
          <div class="flex flex-wrap gap-2">
            @for (c of palette; track c) {
              <button class="size-8 rounded-full ring-offset-2 ring-offset-surface" [style.background]="c" [class.ring-2]="d.color === c"
                [style.--tw-ring-color]="c" (click)="patch({ color: c })"></button>
            }
          </div>
          <div class="space-y-2">
            <div class="label">Дни</div>
            <div class="grid grid-cols-7 gap-1.5">
              @for (w of order(); track w) {
                <button class="rounded-xl py-2 text-sm font-semibold transition" [class.bg-accent]="d.days.includes(w)" [class.text-white]="d.days.includes(w)"
                  [class.bg-surface-2]="!d.days.includes(w)" (click)="toggleDay(w)">{{ wdNames[w] }}</button>
              }
            </div>
            <div class="flex gap-2 text-sm">
              <button class="chip" (click)="patch({ days: [0, 1, 2, 3, 4, 5, 6] })">Каждый день</button>
              <button class="chip" (click)="patch({ days: [1, 2, 3, 4, 5] })">Будни</button>
              <button class="chip" (click)="patch({ days: [0, 6] })">Выходные</button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <div class="label">Цель в день</div>
              <div class="flex items-center gap-2">
                <button class="btn-icon bg-surface-2" (click)="patch({ target: Math.max(1, d.target - 1) })">−</button>
                <span class="w-8 text-center text-lg font-bold">{{ d.target }}</span>
                <button class="btn-icon bg-surface-2" (click)="patch({ target: Math.min(50, d.target + 1) })">+</button>
              </div>
              @if (d.target > 1) {
                <input class="input !py-2 text-sm" placeholder="единица (стак., стр.)" [value]="d.unit" (input)="patch({ unit: $any($event.target).value })" />
              }
            </div>
            <div class="space-y-2">
              <div class="label">Напоминание</div>
              <label class="field"><app-icon name="bell" [size]="16" />
                <input type="time" class="flex-1 bg-transparent outline-none" [value]="d.remindTime ?? ''" (change)="setRemind($any($event.target).value)" />
              </label>
            </div>
          </div>
          <button class="btn btn-primary w-full" [disabled]="!d.name.trim() || !d.days.length" (click)="save(d)">Сохранить</button>
        </div>
      }
    </app-sheet>
  `,
})
export class Habits {
  private data = inject(Data);
  private ui = inject(Ui);
  private settings = inject(SettingsService);
  private notifier = inject(Notifier);
  protected readonly detail = signal<string | null>(null);
  protected readonly draft = signal<Habit | null>(null);
  protected readonly templates = TEMPLATES;
  protected readonly emojis = EMOJIS;
  protected readonly palette = PALETTE;
  protected readonly wdNames = WEEKDAYS_SHORT;
  protected readonly Math = Math;

  protected readonly habits = computed(() => this.data.habits.items().filter((h) => !h.archived).sort((a, b) => a.order - b.order));
  protected readonly detailHabit = computed(() => this.data.habits.get(this.detail()));
  protected readonly isNew = computed(() => !this.data.habits.get(this.draft()?.id));
  protected readonly order = computed(() => weekOrder(this.settings.s().weekStart));
  protected readonly activeToday = computed(() => this.habits().filter((h) => habitActive(h, this.data.today())).length);
  protected readonly doneToday = computed(() => this.habits().filter((h) => habitDone(h, this.data.today())).length);
  protected readonly week = computed(() => {
    const t = this.data.today();
    return Array.from({ length: 7 }, (_, i) => {
      const key = addDays(t, i - 6);
      const d = parseKey(key);
      return { key, label: WEEKDAYS_SHORT[d.getDay()], day: d.getDate(), today: key === t, future: key > t };
    });
  });

  active = (h: Habit, k: string) => habitActive(h, k);
  count = (h: Habit, k: string) => this.data.habitCount(h, k);
  streak = (h: Habit) => habitStreak(h, this.data.today());
  best = (h: Habit) => habitBest(h);
  rate = (h: Habit) => Math.round(habitRate(h) * 100);
  total = (h: Habit) => Object.keys(h.log).filter((k) => habitDone(h, k)).length;
  days = (h: Habit) => daysLabel(h.days, this.settings.s().weekStart);

  heat(h: Habit) {
    const t = this.data.today();
    const ws = this.settings.s().weekStart;
    const end = addDays(t, (6 - ((parseKey(t).getDay() - ws + 7) % 7)));
    const start = addDays(end, -18 * 7 + 1);
    return Array.from({ length: 18 * 7 }, (_, i) => {
      const key = addDays(start, i);
      return { key, v: Math.min(1, (h.log[key] ?? 0) / h.target), future: key > t };
    });
  }

  bump(h: Habit, key: string) {
    vibrate(12);
    const n = this.data.bumpHabit(h, key);
    if (n >= h.target && key === this.data.today()) {
      const s = habitStreak(this.data.habits.get(h.id)!, key);
      if (s > 0 && s % 7 === 0) {
        this.ui.celebrate();
        this.ui.toast(`🔥 ${s} дней подряд — так держать!`);
      }
    }
  }

  blank(): Habit {
    return { id: uid(), name: '', emoji: '✅', color: PALETTE[this.habits().length % PALETTE.length], days: [0, 1, 2, 3, 4, 5, 6],
      target: 1, unit: '', archived: false, order: Date.now(), log: {}, createdAt: Date.now() };
  }

  create() {
    this.draft.set(this.blank());
  }

  fromTemplate([name, emoji, color, target, unit]: [string, string, string, number, string]) {
    this.draft.set({ ...this.blank(), name, emoji, color, target, unit });
  }

  edit(h: Habit) {
    this.detail.set(null);
    this.draft.set({ ...h });
  }

  patch(p: Partial<Habit>) {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  toggleDay(w: number) {
    const d = this.draft()!;
    this.patch({ days: d.days.includes(w) ? d.days.filter((x) => x !== w) : [...d.days, w] });
  }

  setRemind(v: string) {
    this.patch({ remindTime: v || undefined });
    if (v && this.notifier.permission() === 'default') this.notifier.request();
  }

  save(d: Habit) {
    const cur = this.data.habits.get(d.id);
    this.data.habits.upsert({ ...d, name: d.name.trim(), log: cur?.log ?? d.log });
    this.draft.set(null);
    this.ui.toast(cur ? 'Сохранено' : `${d.emoji} Привычка создана`);
  }

  archive(h: Habit) {
    this.data.habits.patch(h.id, { archived: true });
    this.detail.set(null);
    this.ui.toast('Привычка в архиве', { action: 'Вернуть', fn: () => this.data.habits.patch(h.id, { archived: false }) });
  }

  async remove(h: Habit) {
    if (!(await this.ui.confirm(`Удалить «${h.name}»?`, { text: 'Вся история будет потеряна', ok: 'Удалить', danger: true }))) return;
    this.detail.set(null);
    this.data.habits.remove(h.id);
  }
}
