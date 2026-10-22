import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Data, newNote } from '../core/data.service';
import { Pomodoro } from '../core/pomodoro.service';
import { SettingsService } from '../core/settings.service';
import { Ui } from '../core/ui.service';
import { relDay } from '../core/util';
import { Icon } from './icon';

interface Hit {
  id: string;
  icon: string;
  title: string;
  sub: string;
  run: () => void;
}

@Component({
  selector: 'app-search',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ui.search()) {
      <div class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm anim-fade" (click)="close()"></div>
      <div class="fixed inset-x-0 top-0 z-[61] mx-auto flex max-h-[85dvh] max-w-xl flex-col overflow-hidden bg-surface shadow-2xl anim-drop md:top-[12vh] md:rounded-3xl md:border md:border-line"
        (keydown)="key($event)">
        <div class="flex items-center gap-3 border-b border-line px-4 py-3 pt-[max(var(--sa-top),12px)] md:pt-3">
          <app-icon name="search" class="text-muted" />
          <input #inp class="min-w-0 flex-1 bg-transparent py-1.5 text-lg outline-none placeholder:text-muted" placeholder="Поиск и команды…"
            [value]="q()" (input)="q.set(inp.value); sel.set(0)" />
          <button class="btn-icon" (click)="close()" aria-label="Закрыть"><app-icon name="x" /></button>
        </div>
        <div class="overflow-y-auto p-2">
          @for (h of hits(); track h.id; let i = $index) {
            <button class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left" [class.bg-surface-2]="i === sel()"
              (mouseenter)="sel.set(i)" (click)="pick(h)">
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><app-icon [name]="h.icon" [size]="16" /></span>
              <div class="min-w-0 flex-1">
                <div class="truncate">{{ h.title }}</div>
                @if (h.sub) { <div class="truncate text-xs text-muted">{{ h.sub }}</div> }
              </div>
            </button>
          } @empty {
            <p class="py-8 text-center text-sm text-muted">Ничего не найдено</p>
          }
        </div>
      </div>
    }
  `,
})
export class Search {
  protected ui = inject(Ui);
  private data = inject(Data);
  private router = inject(Router);
  private pomo = inject(Pomodoro);
  private settings = inject(SettingsService);
  protected readonly q = signal('');
  protected readonly sel = signal(0);
  private inp = viewChild<ElementRef<HTMLInputElement>>('inp');

  constructor() {
    effect(() => {
      if (this.ui.search()) {
        this.q.set('');
        this.sel.set(0);
        setTimeout(() => this.inp()?.nativeElement.focus(), 30);
      }
    });
  }

  private readonly commands = computed<Hit[]>(() => [
    { id: 'c-task', icon: 'plus', title: 'Новая задача', sub: 'N', run: () => this.ui.quickAdd.set({}) },
    { id: 'c-note', icon: 'note', title: 'Новая заметка', sub: '', run: () => this.newNote() },
    { id: 'c-journal', icon: 'book', title: 'Запись в дневник', sub: '', run: () => this.router.navigateByUrl('/journal') },
    { id: 'c-focus', icon: 'timer', title: this.pomo.state().running ? 'Пауза фокуса' : 'Начать фокус', sub: 'F', run: () => this.pomo.toggle() },
    { id: 'c-theme', icon: 'moon', title: 'Переключить тему', sub: '', run: () => this.settings.set('theme', this.settings.dark() ? 'light' : 'dark') },
    { id: 'c-cal', icon: 'calendar', title: 'Календарь', sub: '', run: () => this.router.navigateByUrl('/calendar') },
    { id: 'c-habits', icon: 'flame', title: 'Привычки', sub: '', run: () => this.router.navigateByUrl('/habits') },
    { id: 'c-alarms', icon: 'alarm', title: 'Будильники', sub: '', run: () => this.router.navigateByUrl('/alarms') },
    { id: 'c-settings', icon: 'sliders', title: 'Настройки', sub: '', run: () => this.router.navigateByUrl('/settings') },
  ]);

  protected readonly hits = computed<Hit[]>(() => {
    const q = this.q().toLowerCase().trim();
    const cmds = this.commands().filter((c) => !q || c.title.toLowerCase().includes(q));
    if (!q) return cmds;
    const has = (...s: string[]) => s.join(' ').toLowerCase().includes(q);
    const tasks: Hit[] = this.data.tasks
      .items()
      .filter((t) => has(t.title, t.notes, t.tags.join(' '), t.subtasks.map((s) => s.title).join(' ')))
      .slice(0, 8)
      .map((t) => ({ id: t.id, icon: t.done ? 'check-square' : 'tasks', title: t.title, sub: t.due ? relDay(t.due) : 'Задача',
        run: () => this.ui.openTask(t.id) }));
    const notes: Hit[] = this.data.notes
      .items()
      .filter((n) => has(n.title, n.body, n.tags.join(' '), n.checklist.map((c) => c.title).join(' ')))
      .slice(0, 6)
      .map((n) => ({ id: n.id, icon: 'note', title: n.title || n.body.slice(0, 60) || 'Заметка', sub: 'Заметка',
        run: () => this.router.navigate(['/notes', n.id]) }));
    const journal: Hit[] = this.data.journal
      .items()
      .filter((e) => has(e.title, e.body, e.tags.join(' ')))
      .slice(0, 6)
      .map((e) => ({ id: e.id, icon: 'book', title: e.title || e.body.slice(0, 60) || 'Запись', sub: 'Дневник · ' + relDay(e.date),
        run: () => this.router.navigate(['/journal', e.id]) }));
    const habits: Hit[] = this.data.habits
      .items()
      .filter((h) => has(h.name))
      .map((h) => ({ id: h.id, icon: 'flame', title: `${h.emoji} ${h.name}`, sub: 'Привычка', run: () => this.router.navigateByUrl('/habits') }));
    return [...tasks, ...notes, ...journal, ...habits, ...cmds];
  });

  private newNote() {
    const n = newNote();
    this.data.notes.upsert(n);
    this.router.navigate(['/notes', n.id]);
  }

  close() {
    this.ui.search.set(false);
  }

  pick(h: Hit) {
    this.close();
    h.run();
  }

  key(e: KeyboardEvent) {
    const n = this.hits().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.sel.set((this.sel() + 1) % Math.max(1, n));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.sel.set((this.sel() - 1 + n) % Math.max(1, n));
    } else if (e.key === 'Enter') {
      const h = this.hits()[this.sel()];
      if (h) this.pick(h);
    } else if (e.key === 'Escape') this.close();
  }
}
