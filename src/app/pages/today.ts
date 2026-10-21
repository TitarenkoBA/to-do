import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Data, habitActive, habitDone, habitStreak } from '../core/data.service';
import { Habit, Mood } from '../core/models';
import { Pomodoro } from '../core/pomodoro.service';
import { Scheduler } from '../core/scheduler.service';
import { SettingsService } from '../core/settings.service';
import { TaskActions, sortTasks } from '../core/task-actions.service';
import { addDays, fmtDuration, greeting, longDate, uid, vibrate } from '../core/util';
import { Icon } from '../shared/icon';
import { Ring } from '../shared/ring';
import { QuickAdd, TaskItem } from '../shared/tasks';
import { Empty, MOODS } from '../shared/ui';

@Component({
  selector: 'app-today',
  imports: [Icon, Ring, QuickAdd, TaskItem, Empty, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-muted first-letter:uppercase">{{ date() }}</p>
          <h1 class="text-[28px] leading-tight font-extrabold tracking-tight md:text-3xl">{{ hello() }}</h1>
        </div>
        <app-ring [value]="progress()" [size]="58" [width]="6">
          <span class="text-sm font-bold">{{ doneCount() }}/{{ total() }}</span>
        </app-ring>
      </header>

      <app-quick-add [due]="data.today()" />

      <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-6">
          @if (overdue().length) {
            <section>
              <h2 class="section-title text-danger">Просрочено <span class="count">{{ overdue().length }}</span></h2>
              <div class="card divide-y divide-line overflow-hidden p-0">
                @for (t of overdue(); track t.id) { <app-task-item [task]="t" /> }
              </div>
            </section>
          }
          <section>
            <h2 class="section-title">Сегодня <span class="count">{{ todays().length }}</span></h2>
            @if (todays().length) {
              <div class="card divide-y divide-line overflow-hidden p-0">
                @for (t of todays(); track t.id) { <app-task-item [task]="t" [showDate]="false" /> }
              </div>
            } @else {
              <div class="card"><app-empty emoji="🌤️" title="Свободный день" text="Добавь задачу выше или просто отдохни" /></div>
            }
          </section>
          @if (done().length) {
            <section>
              <button class="section-title w-full" (click)="showDone.set(!showDone())">
                Выполнено <span class="count">{{ done().length }}</span>
                <app-icon [name]="showDone() ? 'chevron-up' : 'chevron-down'" [size]="16" class="ml-auto" />
              </button>
              @if (showDone()) {
                <div class="card divide-y divide-line overflow-hidden p-0 anim-fade">
                  @for (t of done(); track t.id) { <app-task-item [task]="t" [showDate]="false" /> }
                </div>
              }
            </section>
          }
        </div>

        <aside class="space-y-6">
          <section>
            <div class="flex items-center">
              <h2 class="section-title flex-1">Привычки</h2>
              <a routerLink="/habits" class="text-sm font-semibold text-accent">Все</a>
            </div>
            @if (habits().length) {
              <div class="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar xl:mx-0 xl:grid xl:grid-cols-2 xl:px-0">
                @for (h of habits(); track h.id) {
                  <button class="card flex w-32 shrink-0 snap-start flex-col items-center gap-2 p-3 text-center transition active:scale-95 xl:w-auto"
                    (click)="bump(h)">
                    <app-ring [value]="count(h) / h.target" [size]="52" [width]="5" [color]="h.color">
                      <span class="text-xl" [class.anim-pop]="isDone(h)">{{ isDone(h) ? '✅' : h.emoji }}</span>
                    </app-ring>
                    <span class="w-full truncate text-sm font-semibold">{{ h.name }}</span>
                    <span class="text-xs text-muted">
                      @if (h.target > 1) { {{ count(h) }}/{{ h.target }} {{ h.unit }} } @else { {{ isDone(h) ? 'готово' : 'отметить' }} }
                      @if (streak(h)) { · 🔥{{ streak(h) }} }
                    </span>
                  </button>
                }
              </div>
            } @else {
              <a routerLink="/habits" class="card flex items-center gap-3 text-sm text-muted"><app-icon name="plus" />Создай первую привычку</a>
            }
          </section>

          <section class="grid grid-cols-2 gap-3">
            <a routerLink="/focus" class="card flex flex-col gap-2 transition active:scale-[.98]">
              <div class="flex items-center gap-2 text-sm font-semibold"><span class="text-lg">🍅</span>Фокус</div>
              @if (pomo.active()) {
                <div class="text-2xl font-bold tabular-nums">{{ pomo.label() }}</div>
                <div class="text-xs text-muted">{{ pomo.state().running ? 'идёт' : 'на паузе' }}</div>
              } @else {
                <div class="text-2xl font-bold">{{ focusMin() }}<span class="text-sm font-medium text-muted"> мин</span></div>
                <div class="h-1.5 overflow-hidden rounded-full bg-surface-2"><div class="h-full bg-accent" [style.width.%]="focusPct()"></div></div>
              }
            </a>
            <a routerLink="/alarms" class="card flex flex-col gap-2 transition active:scale-[.98]">
              <div class="flex items-center gap-2 text-sm font-semibold"><app-icon name="alarm" [size]="18" class="text-accent" />Будильник</div>
              @if (sched.nextAlarm(); as n) {
                <div class="text-2xl font-bold tabular-nums">{{ n.alarm.time }}</div>
                <div class="text-xs text-muted">через {{ until(n.ts) }}</div>
              } @else {
                <div class="text-2xl font-bold text-muted">—</div>
                <div class="text-xs text-muted">не заведён</div>
              }
            </a>
          </section>

          <section class="card">
            <div class="mb-3 flex items-center">
              <h2 class="flex-1 font-semibold">{{ todayEntry() ? 'Настроение сегодня' : 'Как ты сегодня?' }}</h2>
              @if (todayEntry(); as e) { <a [routerLink]="['/journal', e.id]" class="text-sm font-semibold text-accent">Запись</a> }
            </div>
            <div class="flex justify-between">
              @for (m of moods; track m.v) {
                <button class="grid size-12 place-items-center rounded-2xl text-3xl transition hover:scale-110 active:scale-90"
                  [class.bg-surface-2]="todayEntry()?.mood === m.v"
                  [class.opacity-40]="todayEntry()?.mood && todayEntry()?.mood !== m.v" (click)="mood(m.v)" [attr.aria-label]="m.l">{{ m.e }}</button>
              }
            </div>
          </section>

          @if (yearAgo(); as e) {
            <a [routerLink]="['/journal', e.id]" class="card block border-accent/30 bg-accent/5">
              <div class="text-xs font-semibold tracking-wide text-accent uppercase">Год назад в этот день</div>
              <div class="mt-1 font-semibold">{{ e.title || 'Запись в дневнике' }}</div>
              <p class="mt-1 line-clamp-2 text-sm text-muted">{{ e.body }}</p>
            </a>
          }
        </aside>
      </div>
    </div>
  `,
})
export class Today {
  protected data = inject(Data);
  protected pomo = inject(Pomodoro);
  protected sched = inject(Scheduler);
  private settings = inject(SettingsService);
  private actions = inject(TaskActions);
  private router = inject(Router);
  protected readonly moods = MOODS;
  protected readonly showDone = signal(false);

  protected readonly date = computed(() => longDate(this.data.today()));
  protected readonly hello = computed(() => {
    const n = this.settings.s().name;
    return greeting() + (n ? `, ${n}` : '');
  });
  protected readonly overdue = computed(() =>
    this.actions.todayOpen().filter((t) => t.due! < this.data.today()).sort(sortTasks),
  );
  protected readonly todays = computed(() =>
    this.actions.todayOpen().filter((t) => t.due === this.data.today()).sort(sortTasks),
  );
  protected readonly done = computed(() => this.actions.todayDone());
  protected readonly doneCount = computed(() => this.done().length);
  protected readonly total = computed(() => this.done().length + this.todays().length + this.overdue().length);
  protected readonly progress = computed(() => (this.total() ? this.doneCount() / this.total() : 0));

  protected readonly habits = computed(() =>
    this.data.habits.items().filter((h) => !h.archived && habitActive(h, this.data.today())).sort((a, b) => a.order - b.order),
  );
  protected readonly focusMin = computed(() => {
    const start = new Date().setHours(0, 0, 0, 0);
    return this.data.sessions.items().filter((s) => s.end >= start).reduce((a, s) => a + s.minutes, 0);
  });
  protected readonly focusPct = computed(() =>
    Math.min(100, (this.focusMin() / (this.settings.s().focusGoal * this.settings.s().focusMin)) * 100),
  );
  protected readonly todayEntry = computed(() => this.data.journal.items().find((e) => e.date === this.data.today()));
  protected readonly yearAgo = computed(() => {
    const k = addDays(this.data.today(), -365);
    const k2 = String(Number(this.data.today().slice(0, 4)) - 1) + this.data.today().slice(4);
    return this.data.journal.items().find((e) => e.date === k2 || e.date === k);
  });

  count = (h: Habit) => this.data.habitCount(h, this.data.today());
  isDone = (h: Habit) => habitDone(h, this.data.today());
  streak = (h: Habit) => habitStreak(h, this.data.today());
  until = (ts: number) => fmtDuration(ts - this.sched.now());

  bump(h: Habit) {
    vibrate(12);
    this.data.bumpHabit(h, this.data.today());
  }

  mood(v: number) {
    vibrate(10);
    const e = this.todayEntry();
    if (e) {
      this.data.journal.upsert({ ...e, mood: v as Mood, updatedAt: Date.now() });
      return;
    }
    const id = uid();
    this.data.journal.upsert({ id, date: this.data.today(), mood: v as Mood, title: '', body: '', tags: [], attachments: [],
      createdAt: Date.now(), updatedAt: Date.now() });
    this.router.navigate(['/journal', id]);
  }
}
