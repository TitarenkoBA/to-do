import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Data, habitDone, occursOn } from '../core/data.service';
import { IoService } from '../core/io.service';
import { SettingsService } from '../core/settings.service';
import { TaskActions, sortTasks } from '../core/task-actions.service';
import { Ui } from '../core/ui.service';
import { MONTHS, WEEKDAYS_SHORT, addDays, addMonths, longDate, parseKey, pickFile, relDay, uid, weekOrder } from '../core/util';
import { Icon } from '../shared/icon';
import { PRIORITY_COLOR, QuickAdd, TaskItem } from '../shared/tasks';
import { MOODS, PageHeader } from '../shared/ui';

@Component({
  selector: 'app-calendar',
  imports: [Icon, PageHeader, TaskItem, QuickAdd, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Календарь">
        <button class="btn-icon" (click)="importIcs()" title="Импорт .ics" aria-label="Импорт"><app-icon name="upload" /></button>
        <button class="btn-icon" (click)="exportIcs()" title="Экспорт в календарь (.ics)" aria-label="Экспорт"><app-icon name="download" /></button>
      </app-page-header>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section class="card p-3 md:p-4" (pointerdown)="sx = $event.clientX" (pointerup)="swipe($event)">
          <div class="mb-3 flex items-center gap-1">
            <button class="btn-icon" (click)="shift(-1)" aria-label="Назад"><app-icon name="chevron-left" /></button>
            <h2 class="flex-1 text-center text-lg font-bold capitalize">{{ monthTitle() }}</h2>
            <button class="btn-icon" (click)="shift(1)" aria-label="Вперёд"><app-icon name="chevron-right" /></button>
          </div>
          <div class="grid grid-cols-7 text-center text-xs font-semibold text-muted uppercase">
            @for (d of weekdays(); track d) { <div class="py-1">{{ d }}</div> }
          </div>
          <div class="grid grid-cols-7 gap-1" [class]="anim()">
            @for (c of cells(); track c.key) {
              <button class="relative flex aspect-square flex-col items-center justify-start rounded-xl pt-1.5 text-sm transition md:aspect-[1.1]"
                [class.opacity-35]="!c.inMonth" [class]="c.key === selected() ? 'bg-accent text-white' : 'hover:bg-surface-2'"
                (click)="selected.set(c.key)">
                <span class="grid size-7 place-items-center rounded-full font-semibold"
                  [class.ring-2]="c.today && c.key !== selected()" [class.ring-accent]="c.today" [class.text-accent]="c.today && c.key !== selected()">{{ c.day }}</span>
                <span class="mt-0.5 flex h-2 items-center gap-0.5">
                  @for (col of c.dots; track $index) {
                    <span class="size-1.5 rounded-full" [style.background]="c.key === selected() ? '#fff' : col"></span>
                  }
                </span>
                @if (c.mood) { <span class="absolute top-0.5 right-0.5 text-[10px] leading-none md:text-xs">{{ c.mood }}</span> }
              </button>
            }
          </div>
          <div class="mt-3 flex justify-center">
            <button class="chip" (click)="goToday()">Сегодня</button>
          </div>
        </section>

        <section class="space-y-4">
          <div>
            <h2 class="text-xl font-bold">{{ rel(selected()) }}</h2>
            <p class="text-sm text-muted first-letter:uppercase">{{ long(selected()) }}</p>
          </div>
          <app-quick-add [due]="selected()" [hint]="false" placeholder="Задача на этот день…" />
          @if (dayTasks().length) {
            <div class="card divide-y divide-line overflow-hidden p-0">
              @for (t of dayTasks(); track t.id) { <app-task-item [task]="t" [showDate]="false" /> }
            </div>
          } @else {
            <p class="py-4 text-center text-sm text-muted">Нет задач на этот день</p>
          }

          <div class="grid grid-cols-2 gap-3">
            @if (entry(); as e) {
              <a [routerLink]="['/journal', e.id]" class="card col-span-2 flex items-center gap-3">
                <span class="text-3xl">{{ moodOf(e.mood) }}</span>
                <div class="min-w-0">
                  <div class="font-semibold">{{ e.title || 'Запись в дневнике' }}</div>
                  <p class="truncate text-sm text-muted">{{ e.body || 'Без текста' }}</p>
                </div>
              </a>
            } @else {
              <button class="card col-span-2 flex items-center gap-3 text-left text-muted" (click)="newEntry()">
                <app-icon name="book" class="text-accent" />Написать в дневник за этот день
              </button>
            }
            @if (habitsDone().length) {
              <div class="card col-span-2">
                <div class="label mb-2">Привычки</div>
                <div class="flex flex-wrap gap-2">
                  @for (h of habitsDone(); track h.id) { <span class="pill">{{ h.emoji }} {{ h.name }}</span> }
                </div>
              </div>
            }
            @if (focusMin()) {
              <div class="card"><div class="label">Фокус</div><div class="text-xl font-bold">🍅 {{ focusMin() }} мин</div></div>
            }
            @for (a of alarms(); track a.id) {
              <div class="card"><div class="label">Будильник</div><div class="text-xl font-bold">⏰ {{ a.time }}</div></div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class CalendarPage {
  private data = inject(Data);
  private settings = inject(SettingsService);
  private actions = inject(TaskActions);
  private io = inject(IoService);
  private ui = inject(Ui);
  private router = inject(Router);

  protected readonly selected = signal(this.data.today());
  protected readonly month = signal(this.data.today().slice(0, 8) + '01');
  protected readonly anim = signal('');
  protected rel = relDay;
  protected long = longDate;
  sx = 0;

  protected readonly monthTitle = computed(() => {
    const d = parseKey(this.month());
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });
  protected readonly weekdays = computed(() => weekOrder(this.settings.s().weekStart).map((d) => WEEKDAYS_SHORT[d]));

  protected readonly cells = computed(() => {
    const first = this.month();
    const ws = this.settings.s().weekStart;
    const offset = (parseKey(first).getDay() - ws + 7) % 7;
    const start = addDays(first, -offset);
    const tasks = this.data.tasks.items();
    const journal = new Map(this.data.journal.items().map((e) => [e.date, e]));
    const today = this.data.today();
    return Array.from({ length: 42 }, (_, i) => {
      const key = addDays(start, i);
      const ts = tasks.filter((t) => occursOn(t, key) && (!t.done || t.due === key));
      const e = journal.get(key);
      return {
        key,
        day: parseKey(key).getDate(),
        inMonth: key.slice(0, 7) === first.slice(0, 7),
        today: key === today,
        dots: ts.slice(0, 3).map((t) => (t.done ? 'var(--line)' : t.priority ? PRIORITY_COLOR[t.priority] : 'var(--accent)')),
        mood: e?.mood ? MOODS[e.mood - 1].e : '',
      };
    });
  });

  protected readonly dayTasks = computed(() => this.actions.tasksOn(this.selected()).sort(sortTasks));
  protected readonly entry = computed(() => this.data.journal.items().find((e) => e.date === this.selected()));
  protected readonly habitsDone = computed(() => this.data.habits.items().filter((h) => habitDone(h, this.selected())));
  protected readonly focusMin = computed(() => {
    const d0 = parseKey(this.selected()).getTime();
    return this.data.sessions.items().filter((s) => s.end >= d0 && s.end < d0 + 86400000).reduce((a, s) => a + s.minutes, 0);
  });
  protected readonly alarms = computed(() => {
    const wd = parseKey(this.selected()).getDay();
    return this.data.alarms.items().filter((a) => a.enabled && (a.days.length ? a.days.includes(wd) : a.onDate === this.selected()));
  });

  moodOf = (m: number) => (m ? MOODS[m - 1].e : '📝');

  shift(n: number) {
    this.anim.set(n > 0 ? 'anim-left' : 'anim-right');
    this.month.set(addMonths(this.month(), n));
    setTimeout(() => this.anim.set(''), 300);
  }

  swipe(e: PointerEvent) {
    const dx = e.clientX - this.sx;
    if (e.pointerType !== 'mouse' && Math.abs(dx) > 60) this.shift(dx < 0 ? 1 : -1);
  }

  goToday() {
    this.month.set(this.data.today().slice(0, 8) + '01');
    this.selected.set(this.data.today());
  }

  newEntry() {
    const id = uid();
    this.data.journal.upsert({ id, date: this.selected(), mood: 0, title: '', body: '', tags: [], attachments: [],
      createdAt: Date.now(), updatedAt: Date.now() });
    this.router.navigate(['/journal', id]);
  }

  exportIcs() {
    const tasks = this.data.tasks.items().filter((t) => t.due && !t.done);
    if (!tasks.length) return this.ui.toast('Нет задач с датой для экспорта');
    this.io.exportICS(tasks);
    this.ui.toast(`Экспортировано: ${tasks.length}. Открой файл — задачи попадут в системный календарь`, { ms: 5000 });
  }

  async importIcs() {
    const f = await pickFile('.ics,text/calendar');
    if (!f) return;
    try {
      const n = await this.io.importICS(await f.text());
      this.ui.toast(`Импортировано задач: ${n}`);
    } catch {
      this.ui.toast('Не удалось прочитать файл');
    }
  }
}
