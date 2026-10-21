import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Data, INBOX } from '../core/data.service';
import { IoService } from '../core/io.service';
import { Attachment, Priority, Repeat, Task } from '../core/models';
import { parseQuick } from '../core/nlp';
import { Notifier } from '../core/notify.service';
import { Pomodoro } from '../core/pomodoro.service';
import { SettingsService } from '../core/settings.service';
import { TaskActions } from '../core/task-actions.service';
import { Ui } from '../core/ui.service';
import { addDays, longDate, relDay, todayKey, uid, vibrate } from '../core/util';
import { Icon } from './icon';
import { Attachments } from './media';
import { Sheet } from './sheet';

export const PRIORITY_COLOR = ['var(--muted)', '#3b82f6', '#f59e0b', '#ef4444'];
export const PRIORITY_LABEL = ['Без приоритета', 'Низкий', 'Средний', 'Высокий'];
export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Не повторять', daily: 'Каждый день', weekdays: 'По будням', weekly: 'Каждую неделю',
  monthly: 'Каждый месяц', yearly: 'Каждый год',
};
export const REMIND_OPTIONS: [number | null, string][] = [
  [null, 'Без напоминания'], [0, 'В момент события'], [5, 'За 5 минут'], [10, 'За 10 минут'], [15, 'За 15 минут'],
  [30, 'За 30 минут'], [60, 'За 1 час'], [120, 'За 2 часа'], [1440, 'За 1 день'],
];

@Component({
  selector: 'app-task-item',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let t = task();
    <div class="relative overflow-hidden rounded-2xl" [class.anim-done]="leaving()">
      <div class="absolute inset-0 flex items-center justify-between px-5 text-white"
        [class]="dx() > 0 ? 'bg-ok' : dx() < 0 ? 'bg-danger' : ''">
        <app-icon name="check" [class.opacity-0]="dx() <= 0" />
        <app-icon name="trash" [class.opacity-0]="dx() >= 0" />
      </div>
      <div class="task-row relative flex items-start gap-3 bg-surface px-3 py-3"
        [style.transform]="dx() ? 'translateX(' + dx() + 'px)' : null" [class.transition-transform]="!dragging"
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up()" (pointercancel)="up()" (click)="open()">
        <button class="checkbox mt-0.5" [class.checked]="t.done" [style.--prio]="prioColor()" (click)="toggle($event)"
          [attr.aria-label]="t.done ? 'Вернуть' : 'Выполнить'">
          <app-icon name="check" [size]="14" [stroke]="3" />
        </button>
        <div class="min-w-0 flex-1">
          <div class="text-[15px] leading-snug break-words" [class.line-through]="t.done" [class.text-muted]="t.done">{{ t.title || 'Без названия' }}</div>
          @if (hasMeta()) {
            <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
              @if (showDate() && t.due) {
                <span class="inline-flex items-center gap-1" [class.text-danger]="overdue()" [class.text-accent]="isToday()">
                  <app-icon name="calendar" [size]="12" />{{ dueLabel() }}
                </span>
              }
              @if (t.time) { <span class="inline-flex items-center gap-1"><app-icon name="clock" [size]="12" />{{ t.time }}</span> }
              @if (t.repeat !== 'none') { <app-icon name="repeat" [size]="12" /> }
              @if (t.remind != null && !t.done) { <app-icon name="bell" [size]="12" /> }
              @if (t.subtasks.length) {
                <span class="inline-flex items-center gap-1"><app-icon name="check-square" [size]="12" />{{ subDone() }}/{{ t.subtasks.length }}</span>
              }
              @if (t.attachments.length) {
                <span class="inline-flex items-center gap-1"><app-icon name="paperclip" [size]="12" />{{ t.attachments.length }}</span>
              }
              @if (t.pomodoros) { <span>🍅{{ t.pomodoros }}</span> }
              @for (tag of t.tags; track tag) { <span class="text-accent">#{{ tag }}</span> }
              @if (showList() && list(); as l) { <span>{{ l.emoji }} {{ l.name }}</span> }
            </div>
          }
        </div>
        @if (t.notes) { <app-icon name="note" [size]="14" class="mt-1 text-muted" /> }
      </div>
    </div>
  `,
})
export class TaskItem {
  private data = inject(Data);
  private ui = inject(Ui);
  private actions = inject(TaskActions);
  readonly task = input.required<Task>();
  readonly showList = input(true);
  readonly showDate = input(true);

  protected readonly dx = signal(0);
  protected readonly leaving = signal(false);
  protected dragging = false;
  private sx = 0;
  private sy = 0;
  private mode: 'none' | 'h' | 'v' = 'none';
  private moved = false;

  protected readonly list = computed(() => (this.task().listId === INBOX ? null : this.data.lists.get(this.task().listId)));
  protected readonly prioColor = computed(() => PRIORITY_COLOR[this.task().priority]);
  protected readonly overdue = computed(() => !this.task().done && !!this.task().due && this.task().due! < this.data.today());
  protected readonly isToday = computed(() => this.task().due === this.data.today());
  protected readonly dueLabel = computed(() => relDay(this.task().due!));
  protected readonly subDone = computed(() => this.task().subtasks.filter((s) => s.done).length);
  protected readonly hasMeta = computed(() => {
    const t = this.task();
    return !!((this.showDate() && t.due) || t.time || t.repeat !== 'none' || t.remind != null || t.subtasks.length ||
      t.attachments.length || t.tags.length || t.pomodoros || (this.showList() && this.list()));
  });

  toggle(e: Event) {
    e.stopPropagation();
    this.actions.toggle(this.task());
  }

  open() {
    if (this.moved) return;
    this.ui.openTask(this.task().id);
  }

  down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.sx = e.clientX;
    this.sy = e.clientY;
    this.mode = 'none';
    this.moved = false;
    this.dragging = true;
  }

  move(e: PointerEvent) {
    if (!this.dragging) return;
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    if (this.mode === 'none') {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        this.mode = 'h';
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10) this.mode = 'v';
    }
    if (this.mode === 'h') {
      this.moved = true;
      const prev = this.dx();
      this.dx.set(dx);
      if (Math.abs(prev) < 90 !== Math.abs(dx) < 90) vibrate(8);
    }
  }

  up() {
    if (!this.dragging) return;
    this.dragging = false;
    const dx = this.dx();
    if (dx > 90) {
      this.dx.set(0);
      this.actions.toggle(this.task());
    } else if (dx < -90) {
      this.dx.set(-window.innerWidth);
      this.leaving.set(true);
      setTimeout(() => this.actions.remove(this.task()), 200);
    } else this.dx.set(0);
    setTimeout(() => (this.moved = false), 50);
  }
}

@Component({
  selector: 'app-quick-add',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <form class="flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 pl-4 shadow-sm focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15 transition"
      (submit)="submit($event)">
      <app-icon name="plus" class="text-accent" />
      <input #inp class="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-muted" [value]="text()"
        (input)="text.set(inp.value)" [placeholder]="placeholder()" enterkeyhint="done" autocomplete="off" />
      <button type="submit" class="grid size-10 place-items-center rounded-xl bg-accent text-white transition active:scale-95 disabled:opacity-40"
        [disabled]="!parsed().title" aria-label="Добавить"><app-icon name="check" /></button>
    </form>
    @if (text().trim()) {
      <div class="mt-2 flex flex-wrap gap-1.5 px-1 anim-fade">
        @let p = parsed();
        @if (p.due) { <span class="pill"><app-icon name="calendar" [size]="12" />{{ rel(p.due) }}</span> }
        @if (p.time) { <span class="pill"><app-icon name="clock" [size]="12" />{{ p.time }}</span> }
        @if (p.repeat) { <span class="pill"><app-icon name="repeat" [size]="12" />{{ repeatLabel[p.repeat] }}</span> }
        @if (p.priority) { <span class="pill" [style.color]="prio[p.priority]"><app-icon name="flag" [size]="12" />{{ prioLabel[p.priority] }}</span> }
        @if (p.remind || p.time) { <span class="pill"><app-icon name="bell" [size]="12" />напомню</span> }
        @for (t of p.tags; track t) { <span class="pill">#{{ t }}</span> }
        @if (p.list) { <span class="pill">&#64;{{ p.list }}</span> }
      </div>
    } @else if (hint()) {
      <p class="mt-2 px-1 text-xs text-muted">Пиши естественно: <b>«завтра в 9 #работа !1»</b>, «каждый пн», «через 2 часа», «25.12»</p>
    }
  `,
})
export class QuickAdd {
  private data = inject(Data);
  private ui = inject(Ui);
  private settings = inject(SettingsService);
  private notifier = inject(Notifier);
  readonly due = input<string | undefined>();
  readonly listId = input<string | undefined>();
  readonly hint = input(true);
  readonly placeholder = input('Новая задача…');
  readonly added = output<Task>();
  protected readonly text = signal('');
  protected readonly parsed = computed(() => parseQuick(this.text()));
  private inp = viewChild.required<ElementRef<HTMLInputElement>>('inp');
  protected readonly repeatLabel = REPEAT_LABEL;
  protected readonly prio = PRIORITY_COLOR;
  protected readonly prioLabel = PRIORITY_LABEL;
  protected rel = relDay;

  focus() {
    setTimeout(() => this.inp().nativeElement.focus(), 50);
  }

  submit(e: Event) {
    e.preventDefault();
    const p = this.parsed();
    if (!p.title) return;
    const lists = this.data.lists.items();
    const list = p.list ? lists.find((l) => l.name.toLowerCase().startsWith(p.list!.toLowerCase())) : undefined;
    const remind = p.remind ? 0 : p.time ? this.settings.s().defaultRemind : null;
    const t = this.data.newTask({
      title: p.title, due: p.due ?? this.due(), time: p.time, priority: p.priority ?? 0, tags: p.tags,
      repeat: p.repeat ?? 'none', remind, listId: list?.id ?? this.listId() ?? INBOX,
    });
    this.data.saveTask(t);
    if (remind != null && this.notifier.permission() === 'default') this.notifier.request();
    vibrate(10);
    this.text.set('');
    this.inp().nativeElement.value = '';
    this.ui.toast(t.due ? `Добавлено · ${relDay(t.due)}${t.time ? ' ' + t.time : ''}` : 'Добавлено во Входящие', { icon: 'check' });
    this.added.emit(t);
  }
}

@Component({
  selector: 'app-task-editor',
  imports: [Icon, Sheet, Attachments],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [open]="!!task()" (closed)="close()" [wide]="true">
      @if (task(); as t) {
        <div class="space-y-5 px-5 pb-6">
          <div class="flex items-start gap-3">
            <button class="checkbox mt-1.5 !size-6" [class.checked]="t.done" [style.--prio]="prio[t.priority]" (click)="actions.toggle(t)">
              <app-icon name="check" [size]="15" [stroke]="3" />
            </button>
            <textarea class="autogrow flex-1 resize-none bg-transparent text-xl font-semibold outline-none placeholder:text-muted"
              rows="1" [value]="t.title" (input)="set({ title: $any($event.target).value })" placeholder="Что нужно сделать?"></textarea>
          </div>
          <textarea class="autogrow input min-h-20 resize-none" rows="2" [value]="t.notes" placeholder="Заметка…"
            (input)="set({ notes: $any($event.target).value })"></textarea>

          <section class="space-y-2">
            <div class="label">Когда</div>
            <div class="flex flex-wrap gap-2">
              <button class="chip" [class.chip-on]="t.due === today" (click)="set({ due: today })">Сегодня</button>
              <button class="chip" [class.chip-on]="t.due === tomorrow" (click)="set({ due: tomorrow })">Завтра</button>
              <button class="chip" [class.chip-on]="t.due === nextWeek" (click)="set({ due: nextWeek })">Через неделю</button>
              @if (t.due) { <button class="chip" (click)="set({ due: undefined, time: undefined })"><app-icon name="x" [size]="14" />Без даты</button> }
            </div>
            <div class="grid grid-cols-2 gap-2">
              <label class="field"><app-icon name="calendar" [size]="16" />
                <input type="date" class="flex-1 bg-transparent outline-none" [value]="t.due ?? ''" (change)="set({ due: $any($event.target).value || undefined })" />
              </label>
              <label class="field"><app-icon name="clock" [size]="16" />
                <input type="time" class="flex-1 bg-transparent outline-none" [value]="t.time ?? ''" (change)="setTime($any($event.target).value)" />
              </label>
            </div>
            @if (t.due) { <p class="text-xs text-muted">{{ long(t.due) }}</p> }
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label class="field"><app-icon name="bell" [size]="16" />
                <select class="flex-1 bg-transparent outline-none" (change)="setRemind($any($event.target).value)">
                  @for (o of remindOpts; track o[1]) { <option [value]="o[0] ?? ''" [selected]="t.remind === o[0]">{{ o[1] }}</option> }
                </select>
              </label>
              <label class="field"><app-icon name="repeat" [size]="16" />
                <select class="flex-1 bg-transparent outline-none" (change)="setRepeat($any($event.target).value)">
                  @for (r of repeats; track r) { <option [value]="r" [selected]="t.repeat === r">{{ repeatLabel[r] }}</option> }
                </select>
              </label>
            </div>
          </section>

          <section class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <div class="label">Приоритет</div>
              <div class="flex gap-2">
                @for (p of [3, 2, 1, 0]; track p) {
                  <button class="chip flex-1 justify-center" [class.chip-on]="t.priority === p" [style.color]="prio[p]"
                    (click)="set({ priority: $any(p) })" [attr.aria-label]="prioLabel[p]"><app-icon name="flag" [size]="16" [fill]="p > 0 && t.priority === p" /></button>
                }
              </div>
            </div>
            <div class="space-y-2">
              <div class="label">Список</div>
              <label class="field">
                <select class="flex-1 bg-transparent outline-none" (change)="set({ listId: $any($event.target).value })">
                  @for (l of data.sortedLists(); track l.id) { <option [value]="l.id" [selected]="t.listId === l.id">{{ l.emoji }} {{ l.name }}</option> }
                </select>
              </label>
            </div>
          </section>

          <section class="space-y-2">
            <div class="label">Теги</div>
            <div class="flex flex-wrap items-center gap-2">
              @for (tag of t.tags; track tag) {
                <button class="chip chip-on" (click)="removeTag(tag)">#{{ tag }} <app-icon name="x" [size]="12" /></button>
              }
              <input #tagInp class="min-w-28 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted" placeholder="+ тег"
                enterkeyhint="done" (keydown.enter)="addTag(tagInp)" (blur)="addTag(tagInp)" />
            </div>
          </section>

          <section class="space-y-2">
            <div class="label">Подзадачи @if (t.subtasks.length) { · {{ subDone() }}/{{ t.subtasks.length }} }</div>
            @if (t.subtasks.length) {
              <div class="h-1.5 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent transition-all" [style.width.%]="subDone() / t.subtasks.length * 100"></div></div>
            }
            @for (s of t.subtasks; track s.id) {
              <div class="group flex items-center gap-3">
                <button class="checkbox !size-5" [class.checked]="s.done" (click)="toggleSub(s.id)"><app-icon name="check" [size]="12" [stroke]="3" /></button>
                <input class="flex-1 bg-transparent py-1 outline-none" [class.line-through]="s.done" [class.text-muted]="s.done" [value]="s.title"
                  (change)="renameSub(s.id, $any($event.target).value)" />
                <button class="btn-icon !size-8 text-muted" (click)="removeSub(s.id)"><app-icon name="x" [size]="16" /></button>
              </div>
            }
            <div class="flex items-center gap-3">
              <span class="grid size-5 place-items-center text-muted"><app-icon name="plus" [size]="16" /></span>
              <input #subInp class="flex-1 bg-transparent py-1 outline-none placeholder:text-muted" placeholder="Добавить подзадачу"
                enterkeyhint="enter" (keydown.enter)="addSub(subInp)" />
            </div>
          </section>

          <section class="space-y-2">
            <div class="label">Вложения</div>
            <app-attachments [items]="t.attachments" (changed)="setAtt($event)" />
          </section>

          <div class="flex flex-wrap gap-2 border-t border-line pt-4">
            <button class="btn btn-soft" (click)="focus(t)">🍅 Фокус @if (t.pomodoros) { · {{ t.pomodoros }} }</button>
            @if (t.due) { <button class="btn btn-soft" (click)="io.shareICS(t)"><app-icon name="calendar" [size]="16" />В календарь</button> }
            <span class="flex-1"></span>
            <button class="btn btn-ghost text-danger" (click)="remove(t)"><app-icon name="trash" [size]="16" />Удалить</button>
          </div>
        </div>
      }
    </app-sheet>
  `,
})
export class TaskEditor {
  protected data = inject(Data);
  protected ui = inject(Ui);
  protected io = inject(IoService);
  protected actions = inject(TaskActions);
  private pomodoro = inject(Pomodoro);
  private router = inject(Router);
  private notifier = inject(Notifier);

  protected readonly task = computed(() => this.data.tasks.get(this.ui.taskId()));
  protected readonly subDone = computed(() => this.task()?.subtasks.filter((s) => s.done).length ?? 0);
  protected readonly prio = PRIORITY_COLOR;
  protected readonly prioLabel = PRIORITY_LABEL;
  protected readonly repeatLabel = REPEAT_LABEL;
  protected readonly repeats = Object.keys(REPEAT_LABEL) as Repeat[];
  protected readonly remindOpts = REMIND_OPTIONS;
  protected readonly today = todayKey();
  protected readonly tomorrow = addDays(this.today, 1);
  protected readonly nextWeek = addDays(this.today, 7);
  protected long = longDate;

  set(patch: Partial<Task>) {
    const t = this.task();
    if (t) this.data.saveTask({ ...t, ...patch });
  }

  setTime(v: string) {
    const t = this.task();
    if (!t) return;
    this.set({ time: v || undefined, due: t.due ?? (v ? this.today : undefined) });
  }

  setRemind(v: string) {
    const remind = v === '' ? null : Number(v);
    const t = this.task();
    this.set({ remind, due: t?.due ?? (remind != null ? this.today : undefined) });
    if (remind != null && this.notifier.permission() === 'default') this.notifier.request();
  }

  setRepeat(v: string) {
    this.set({ repeat: v as Repeat, due: this.task()?.due ?? (v !== 'none' ? this.today : undefined) });
  }

  addTag(el: HTMLInputElement) {
    const v = el.value.trim().replace(/^#/, '').toLowerCase();
    el.value = '';
    const t = this.task();
    if (v && t && !t.tags.includes(v)) this.set({ tags: [...t.tags, v] });
  }

  removeTag(tag: string) {
    this.set({ tags: this.task()!.tags.filter((x) => x !== tag) });
  }

  addSub(el: HTMLInputElement) {
    const v = el.value.trim();
    if (!v) return;
    el.value = '';
    this.set({ subtasks: [...this.task()!.subtasks, { id: uid(), title: v, done: false }] });
  }

  toggleSub(id: string) {
    vibrate(8);
    this.set({ subtasks: this.task()!.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  }

  renameSub(id: string, title: string) {
    this.set({ subtasks: this.task()!.subtasks.map((s) => (s.id === id ? { ...s, title } : s)) });
  }

  removeSub(id: string) {
    this.set({ subtasks: this.task()!.subtasks.filter((s) => s.id !== id) });
  }

  setAtt(a: Attachment[]) {
    this.set({ attachments: a });
  }

  focus(t: Task) {
    this.pomodoro.startForTask(t.id);
    this.close();
    this.router.navigateByUrl('/focus');
  }

  remove(t: Task) {
    this.close();
    this.actions.remove(t);
  }

  close() {
    const t = this.task();
    if (t && !t.title.trim() && !t.notes && !t.attachments.length) this.data.tasks.remove(t.id);
    this.ui.taskId.set(null);
  }
}

export type { Priority };
