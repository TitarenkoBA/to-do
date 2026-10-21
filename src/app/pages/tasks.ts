import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Data, INBOX } from '../core/data.service';
import { Task, TaskList } from '../core/models';
import { sortTasks } from '../core/task-actions.service';
import { Ui } from '../core/ui.service';
import { PALETTE, addDays, dateKey, diffDays, relDay, uid } from '../core/util';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { QuickAdd, TaskItem } from '../shared/tasks';
import { Empty, PageHeader } from '../shared/ui';

interface Group {
  key: string;
  title: string;
  tone?: string;
  tasks: Task[];
}

@Component({
  selector: 'app-tasks',
  imports: [Icon, PageHeader, QuickAdd, TaskItem, Empty, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header [title]="title()" [sub]="openCount() + ' ' + 'открыто'">
        @if (list(); as l) {
          <button class="btn-icon" (click)="editList(l)" aria-label="Настроить список"><app-icon name="edit" /></button>
        }
      </app-page-header>

      <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
        @for (c of chips(); track c.id) {
          <button class="chip shrink-0" [class.chip-on]="filter() === c.id" (click)="go(c.id)">
            {{ c.emoji }} {{ c.name }} @if (c.count) { <span class="opacity-60">{{ c.count }}</span> }
          </button>
        }
        <button class="chip shrink-0" (click)="newList()"><app-icon name="plus" [size]="14" />Список</button>
      </div>

      @if (filter() !== 'done') {
        <app-quick-add [listId]="list()?.id" [hint]="false" class="mb-5" />
      }

      @if (tags().length) {
        <div class="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
          @for (t of tags(); track t) {
            <button class="pill shrink-0" [class.!bg-accent]="tag() === t" [class.!text-white]="tag() === t"
              (click)="tag.set(tag() === t ? null : t)">#{{ t }}</button>
          }
        </div>
      }

      @for (g of groups(); track g.key) {
        <section class="mb-5">
          <h2 class="section-title" [class]="g.tone ?? ''">{{ g.title }} <span class="count">{{ g.tasks.length }}</span></h2>
          <div class="card divide-y divide-line overflow-hidden p-0">
            @for (t of g.tasks; track t.id) { <app-task-item [task]="t" [showList]="!list()" /> }
          </div>
        </section>
      } @empty {
        <app-empty [emoji]="filter() === 'done' ? '🏆' : '🎯'" [title]="filter() === 'done' ? 'Пока ничего не выполнено' : 'Здесь пусто'"
          [text]="filter() === 'done' ? 'Выполненные задачи появятся здесь' : 'Добавь задачу через поле выше'" />
      }

      @if (filter() !== 'done' && doneHere().length) {
        <button class="section-title w-full" (click)="showDone.set(!showDone())">
          Выполненные <span class="count">{{ doneHere().length }}</span>
          <app-icon [name]="showDone() ? 'chevron-up' : 'chevron-down'" [size]="16" class="ml-auto" />
        </button>
        @if (showDone()) {
          <div class="card divide-y divide-line overflow-hidden p-0 anim-fade">
            @for (t of doneHere(); track t.id) { <app-task-item [task]="t" [showList]="!list()" /> }
          </div>
        }
      }
    </div>

    <app-sheet [open]="!!editing()" [title]="editing()?.createdAt ? 'Список' : 'Новый список'" (closed)="editing.set(null)">
      @if (editing(); as l) {
        <div class="space-y-4 px-5 pb-6">
          <div class="flex gap-2">
            <input class="input w-16 text-center text-2xl" [value]="l.emoji" maxlength="4" (input)="patch({ emoji: $any($event.target).value })" />
            <input class="input flex-1" [value]="l.name" placeholder="Название" (input)="patch({ name: $any($event.target).value })" />
          </div>
          <div class="flex flex-wrap gap-2">
            @for (c of palette; track c) {
              <button class="size-9 rounded-full ring-offset-2 ring-offset-surface transition" [style.background]="c"
                [class.ring-2]="l.color === c" [style.--tw-ring-color]="c" (click)="patch({ color: c })"></button>
            }
          </div>
          <div class="flex gap-2">
            @if (l.createdAt && l.id !== inbox) {
              <button class="btn btn-ghost text-danger" (click)="deleteList(l)"><app-icon name="trash" [size]="16" />Удалить</button>
            }
            <span class="flex-1"></span>
            <button class="btn btn-primary" (click)="saveList(l)" [disabled]="!l.name.trim()">Сохранить</button>
          </div>
        </div>
      }
    </app-sheet>
  `,
})
export class Tasks {
  protected data = inject(Data);
  private ui = inject(Ui);
  private router = inject(Router);
  /** query param ?f=all|inbox|upcoming|done|<listId> */
  readonly f = input<string>();
  protected readonly filter = computed(() => this.f() || 'all');
  protected readonly tag = signal<string | null>(null);
  protected readonly showDone = signal(false);
  protected readonly editing = signal<TaskList | null>(null);
  protected readonly palette = PALETTE;
  protected readonly inbox = INBOX;

  protected readonly list = computed(() => this.data.lists.get(this.filter()) ?? null);
  protected readonly title = computed(() => {
    const f = this.filter();
    if (f === 'all') return 'Все задачи';
    if (f === 'upcoming') return 'Предстоящие';
    if (f === 'done') return 'Выполненные';
    const l = this.list();
    return l ? `${l.emoji} ${l.name}` : 'Задачи';
  });

  private readonly scoped = computed(() => {
    const f = this.filter();
    const tag = this.tag();
    let items = this.data.tasks.items();
    if (this.list()) items = items.filter((t) => t.listId === f);
    if (f === 'upcoming') items = items.filter((t) => t.due && t.due > this.data.today());
    if (tag) items = items.filter((t) => t.tags.includes(tag));
    return items;
  });

  protected readonly openCount = computed(() => this.scoped().filter((t) => !t.done).length);
  protected readonly doneHere = computed(() => this.scoped().filter((t) => t.done).sort(sortTasks));
  protected readonly tags = computed(() => [...new Set(this.data.tasks.items().flatMap((t) => t.tags))].sort());

  protected readonly chips = computed(() => {
    const open = this.data.tasks.items().filter((t) => !t.done);
    const today = this.data.today();
    return [
      { id: 'all', emoji: '🗂️', name: 'Все', count: open.length },
      { id: 'upcoming', emoji: '📅', name: 'Предстоящие', count: open.filter((t) => t.due && t.due > today).length },
      ...this.data.sortedLists().map((l) => ({ id: l.id, emoji: l.emoji, name: l.name, count: open.filter((t) => t.listId === l.id).length })),
      { id: 'done', emoji: '🏆', name: 'Выполненные', count: 0 },
    ];
  });

  protected readonly groups = computed<Group[]>(() => {
    const today = this.data.today();
    if (this.filter() === 'done') {
      const map = new Map<string, Task[]>();
      for (const t of this.doneHere()) {
        const k = dateKey(new Date(t.completedAt ?? t.updatedAt));
        map.set(k, [...(map.get(k) ?? []), t]);
      }
      return [...map.entries()].map(([k, tasks]) => ({ key: k, title: relDay(k), tasks }));
    }
    const open = this.scoped().filter((t) => !t.done).sort(sortTasks);
    if (this.filter() === 'upcoming') {
      const map = new Map<string, Task[]>();
      for (const t of open) map.set(t.due!, [...(map.get(t.due!) ?? []), t]);
      return [...map.entries()].map(([k, tasks]) => ({ key: k, title: relDay(k), tasks }));
    }
    const buckets: Group[] = [
      { key: 'over', title: 'Просрочено', tone: 'text-danger', tasks: [] },
      { key: 'today', title: 'Сегодня', tone: 'text-accent', tasks: [] },
      { key: 'tom', title: 'Завтра', tasks: [] },
      { key: 'week', title: 'На неделе', tasks: [] },
      { key: 'later', title: 'Позже', tasks: [] },
      { key: 'none', title: 'Без срока', tasks: [] },
    ];
    for (const t of open) {
      if (!t.due) buckets[5].tasks.push(t);
      else if (t.due < today) buckets[0].tasks.push(t);
      else if (t.due === today) buckets[1].tasks.push(t);
      else if (t.due === addDays(today, 1)) buckets[2].tasks.push(t);
      else if (diffDays(t.due, today) <= 7) buckets[3].tasks.push(t);
      else buckets[4].tasks.push(t);
    }
    return buckets.filter((b) => b.tasks.length);
  });

  go(f: string) {
    this.tag.set(null);
    this.router.navigate(['/tasks'], { queryParams: { f: f === 'all' ? null : f } });
  }

  newList() {
    this.editing.set({ id: uid(), name: '', emoji: '📁', color: PALETTE[(this.data.lists.items().length * 3) % PALETTE.length], order: this.data.lists.items().length, createdAt: 0 });
  }

  editList(l: TaskList) {
    this.editing.set({ ...l });
  }

  patch(p: Partial<TaskList>) {
    this.editing.update((l) => (l ? { ...l, ...p } : l));
  }

  saveList(l: TaskList) {
    const isNew = !l.createdAt;
    this.data.lists.upsert({ ...l, name: l.name.trim(), createdAt: l.createdAt || Date.now() });
    this.editing.set(null);
    if (isNew) this.go(l.id);
  }

  async deleteList(l: TaskList) {
    const n = this.data.tasks.items().filter((t) => t.listId === l.id).length;
    const ok = await this.ui.confirm(`Удалить «${l.name}»?`, {
      text: n ? `${n} задач(и) переместятся во Входящие` : undefined, ok: 'Удалить', danger: true,
    });
    if (!ok) return;
    for (const t of this.data.tasks.items().filter((x) => x.listId === l.id)) this.data.tasks.patch(t.id, { listId: INBOX });
    this.data.lists.remove(l.id);
    this.editing.set(null);
    this.go('all');
  }
}
