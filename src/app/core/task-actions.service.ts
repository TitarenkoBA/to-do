import { Injectable, computed, inject } from '@angular/core';
import { Data, occursOn } from './data.service';
import { MediaService } from './media.service';
import { Task } from './models';
import { SettingsService } from './settings.service';
import { SoundService } from './sound.service';
import { Ui } from './ui.service';
import { relDay, vibrate } from './util';

@Injectable({ providedIn: 'root' })
export class TaskActions {
  private data = inject(Data);
  private ui = inject(Ui);
  private sound = inject(SoundService);
  private media = inject(MediaService);
  private settings = inject(SettingsService);

  /** Open tasks due today or overdue */
  readonly todayOpen = computed(() => {
    const t = this.data.today();
    return this.data.tasks.items().filter((x) => !x.done && x.due && x.due <= t);
  });
  readonly todayDone = computed(() => {
    const t = this.data.today();
    return this.data.tasks
      .items()
      .filter((x) => x.done && x.completedAt && new Date(x.completedAt).toDateString() === new Date().toDateString());
  });

  toggle(t: Task) {
    const wasDone = t.done;
    const next = this.data.toggleTask(t.id);
    if (wasDone) return;
    if (this.settings.s().vibrate) vibrate(15);
    this.sound.play('done', 0.5);
    if (next) this.ui.toast(`Повтор: ${relDay(next).toLowerCase()}`, { icon: 'repeat' });
    else
      this.ui.toast('Выполнено', {
        icon: 'check',
        action: 'Отменить',
        fn: () => this.data.saveTask({ ...this.data.tasks.get(t.id)!, done: false, completedAt: undefined }),
      });
    if (t.due && t.due <= this.data.today() && this.todayOpen().length === 0) {
      setTimeout(() => {
        this.ui.celebrate();
        this.ui.toast('Все задачи на сегодня выполнены! 🎉', { ms: 4000 });
      }, 250);
    }
  }

  remove(t: Task) {
    this.data.tasks.remove(t.id);
    let undone = false;
    this.ui.toast('Задача удалена', {
      icon: 'trash',
      action: 'Вернуть',
      fn: () => {
        undone = true;
        this.data.tasks.upsert(t);
      },
    });
    setTimeout(() => !undone && this.media.remove(t.attachments), 6000);
  }

  tasksOn(key: string) {
    return this.data.tasks.items().filter((t) => occursOn(t, key) && (!t.done || t.due === key));
  }
}

export function sortTasks(a: Task, b: Task) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
  if ((a.due ?? '9') !== (b.due ?? '9')) return (a.due ?? '9') < (b.due ?? '9') ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  if ((a.time ?? '99') !== (b.time ?? '99')) return (a.time ?? '99') < (b.time ?? '99') ? -1 : 1;
  return a.order - b.order;
}
