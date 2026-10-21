import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Data, INBOX, newEntry, newNote } from './core/data.service';
import { Notifier } from './core/notify.service';
import { Pomodoro } from './core/pomodoro.service';
import { Pwa } from './core/pwa.service';
import { Scheduler } from './core/scheduler.service';
import { SettingsService } from './core/settings.service';
import { SoundService } from './core/sound.service';
import { TaskActions } from './core/task-actions.service';
import { Ui } from './core/ui.service';
import { Icon } from './shared/icon';
import { Viewer } from './shared/media';
import { Confetti } from './shared/ring';
import { Search } from './shared/search';
import { Sheet } from './shared/sheet';
import { QuickAdd, TaskEditor } from './shared/tasks';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Sheet, QuickAdd, TaskEditor, Search, Viewer, Confetti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'shortcut($event)',
    '(document:pointerdown)': 'sound.unlock()',
  },
  templateUrl: './app.html',
})
export class App {
  protected data = inject(Data);
  protected ui = inject(Ui);
  protected pomo = inject(Pomodoro);
  protected sched = inject(Scheduler);
  protected sound = inject(SoundService);
  protected settings = inject(SettingsService);
  protected pwa = inject(Pwa);
  protected notifier = inject(Notifier);
  private actions = inject(TaskActions);
  private router = inject(Router);
  private quick = viewChild<QuickAdd>('quick');
  protected readonly welcomeName = signal('');

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: '/' },
  );
  protected readonly section = computed(() => this.url().split(/[/?]/)[1] || 'today');
  protected readonly deep = computed(() => /^\/(notes|journal)\/./.test(this.url()));
  protected readonly showFab = computed(() => ['today', 'tasks', 'calendar', 'notes', 'journal'].includes(this.section()) && !this.deep());

  protected readonly nav = computed(() => {
    const open = this.data.tasks.items().filter((t) => !t.done).length;
    return [
      { path: '/today', icon: 'sun', name: 'Сегодня', count: this.actions.todayOpen().length },
      { path: '/tasks', icon: 'tasks', name: 'Задачи', count: open },
      { path: '/calendar', icon: 'calendar', name: 'Календарь', count: 0 },
      { path: '/notes', icon: 'note', name: 'Заметки', count: 0 },
      { path: '/journal', icon: 'book', name: 'Дневник', count: 0 },
      { path: '/habits', icon: 'flame', name: 'Привычки', count: 0 },
      { path: '/focus', icon: 'timer', name: 'Фокус', count: 0 },
      { path: '/alarms', icon: 'alarm', name: 'Будильники', count: 0 },
      { path: '/settings', icon: 'sliders', name: 'Настройки', count: 0 },
    ];
  });
  protected readonly tabs = [
    { path: '/today', icon: 'sun', name: 'Сегодня' },
    { path: '/tasks', icon: 'tasks', name: 'Задачи' },
    { path: '/calendar', icon: 'calendar', name: 'Календарь' },
    { path: '/notes', icon: 'note', name: 'Заметки' },
  ];
  protected readonly moreActive = computed(() => ['more', 'journal', 'habits', 'focus', 'alarms', 'settings'].includes(this.section()));
  protected readonly listCounts = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.data.tasks.items()) if (!t.done) m.set(t.listId, (m.get(t.listId) ?? 0) + 1);
    return m;
  });

  constructor() {
    this.pwa.init();
    this.sched.start();
    this.router.events.pipe(filter((e) => e instanceof NavigationStart)).subscribe(() => {
      this.ui.taskId.set(null);
      this.ui.quickAdd.set(null);
      this.ui.search.set(false);
      this.ui.viewer.set(null);
    });
  }

  fab() {
    const s = this.section();
    if (s === 'notes') {
      const n = newNote();
      this.data.notes.upsert(n);
      this.router.navigate(['/notes', n.id]);
    } else if (s === 'journal') {
      const existing = this.data.journal.items().find((e) => e.date === this.data.today());
      const e = existing ?? newEntry(this.data.today());
      if (!existing) this.data.journal.upsert(e);
      this.router.navigate(['/journal', e.id]);
    } else {
      const f = new URLSearchParams(this.url().split('?')[1] ?? '').get('f') ?? undefined;
      this.openQuick({ due: s === 'today' ? this.data.today() : undefined, listId: f && this.data.lists.get(f) ? f : undefined });
    }
  }

  openQuick(o: { due?: string; listId?: string } = {}) {
    this.ui.quickAdd.set(o);
    setTimeout(() => this.quick()?.focus(), 80);
  }

  shortcut(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.ui.search.set(!this.ui.search());
      return;
    }
    if (el.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.ui.taskId() || this.ui.quickAdd() || this.ui.search()) return;
    const k = e.key.toLowerCase();
    if (k === 'n' || k === 'т') {
      e.preventDefault();
      this.openQuick();
    } else if (k === '/') {
      e.preventDefault();
      this.ui.search.set(true);
    } else if (k === 'f' || k === 'а') this.pomo.toggle();
  }

  finishWelcome() {
    this.settings.set('name', this.welcomeName().trim());
    this.settings.set('onboarded', true);
    if (this.notifier.permission() === 'default') this.notifier.request();
  }

  confirm(v: boolean) {
    this.ui.confirmReq()?.resolve(v);
    this.ui.confirmReq.set(null);
  }

  protected readonly INBOX = INBOX;
}
