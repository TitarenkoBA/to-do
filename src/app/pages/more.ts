import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Data, habitActive, habitDone } from '../core/data.service';
import { Pomodoro } from '../core/pomodoro.service';
import { Pwa } from '../core/pwa.service';
import { Scheduler } from '../core/scheduler.service';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/ui';

@Component({
  selector: 'app-more',
  imports: [Icon, RouterLink, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Ещё" />
      <div class="grid grid-cols-2 gap-3">
        @for (t of tiles(); track t.path) {
          <a [routerLink]="t.path" class="card flex flex-col gap-3 transition active:scale-[.97]">
            <span class="grid size-11 place-items-center rounded-2xl text-white" [style.background]="t.color"><app-icon [name]="t.icon" /></span>
            <div>
              <div class="font-semibold">{{ t.name }}</div>
              <div class="text-sm text-muted">{{ t.sub }}</div>
            </div>
          </a>
        }
      </div>
      @if (pwa.canInstall()) {
        <button class="card mt-4 flex w-full items-center gap-3 border-accent/30 bg-accent/8 text-left" (click)="pwa.install()">
          <span class="text-2xl">📲</span>
          <div class="flex-1"><div class="font-semibold">Установить Ритм</div><div class="text-sm text-muted">Работает без интернета, как обычное приложение</div></div>
          <app-icon name="chevron-right" class="text-muted" />
        </button>
      }
    </div>
  `,
})
export class More {
  private data = inject(Data);
  private pomo = inject(Pomodoro);
  private sched = inject(Scheduler);
  protected pwa = inject(Pwa);

  protected readonly tiles = computed(() => {
    const today = this.data.today();
    const habits = this.data.habits.items().filter((h) => !h.archived && habitActive(h, today));
    const next = this.sched.nextAlarm();
    return [
      { path: '/notes', name: 'Заметки', icon: 'note', color: '#f59e0b', sub: `${this.data.notes.items().filter((n) => !n.archived).length} шт.` },
      { path: '/journal', name: 'Дневник', icon: 'book', color: '#ec4899', sub: `${this.data.journal.items().length} записей` },
      { path: '/habits', name: 'Привычки', icon: 'flame', color: '#f97316', sub: `${habits.filter((h) => habitDone(h, today)).length}/${habits.length} сегодня` },
      { path: '/focus', name: 'Фокус', icon: 'timer', color: '#ef4444', sub: this.pomo.active() ? this.pomo.label() : 'Помодоро' },
      { path: '/alarms', name: 'Будильники', icon: 'alarm', color: '#3b82f6', sub: next ? `⏰ ${next.alarm.time}` : 'Не заведены' },
      { path: '/settings', name: 'Настройки', icon: 'sliders', color: '#64748b', sub: 'Тема, данные' },
    ];
  });
}
