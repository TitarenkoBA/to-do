import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Ui } from '../core/ui.service';
import { Icon } from './icon';

export const MOODS = [
  { v: 1, e: '😫', l: 'Ужасно', c: '#ef4444' },
  { v: 2, e: '😕', l: 'Плохо', c: '#f97316' },
  { v: 3, e: '😐', l: 'Нормально', c: '#eab308' },
  { v: 4, e: '🙂', l: 'Хорошо', c: '#84cc16' },
  { v: 5, e: '🤩', l: 'Отлично', c: '#10b981' },
] as const;

export const NOTE_COLORS = ['', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#06b6d4', '#10b981', '#84cc16'];

export const EMOJIS = '✅💧🏃🤸📚🧘😴🍎🥗💊🦷🚭🍷☕📝🎸🎨💻🧹🌱🐶🚶🚴🏊💪🧠🙏💰📵🌞🛏️🪥🧴🫁🎯📖✍️🗣️🎧🌿🧺🍳'.match(
  /\p{Extended_Pictographic}(️)?/gu,
) as string[];

export const JOURNAL_PROMPTS = [
  'За что я сегодня благодарен?',
  'Что сегодня принесло радость?',
  'Чему я научился сегодня?',
  'Что бы я сделал иначе?',
  'Какой момент дня хочется запомнить?',
  'Что меня беспокоит и что я могу с этим сделать?',
  'Кто сегодня сделал мой день лучше?',
  'Какая маленькая победа была сегодня?',
  'Что я хочу сделать завтра обязательно?',
  'Как я позаботился о себе сегодня?',
  'О чём я мечтаю в последнее время?',
  'Что сегодня удивило?',
];

@Component({
  selector: 'app-page-header',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page-header' },
  template: `
    <div class="min-w-0 flex-1">
      @if (sub()) { <p class="text-sm font-medium text-muted first-letter:uppercase">{{ sub() }}</p> }
      <h1 class="truncate text-[28px] leading-tight font-extrabold tracking-tight md:text-3xl">{{ title() }}</h1>
    </div>
    <ng-content />
    <button class="btn-icon lg:hidden" (click)="ui.search.set(true)" aria-label="Поиск"><app-icon name="search" /></button>
  `,
})
export class PageHeader {
  protected ui = inject(Ui);
  readonly title = input.required<string>();
  readonly sub = input('');
}

@Component({
  selector: 'app-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center px-6 py-10 text-center anim-fade' },
  template: `
    <div class="mb-3 text-5xl">{{ emoji() }}</div>
    <div class="font-semibold">{{ title() }}</div>
    @if (text()) { <p class="mt-1 max-w-xs text-sm text-muted">{{ text() }}</p> }
    <div class="mt-4"><ng-content /></div>
  `,
})
export class Empty {
  readonly emoji = input('✨');
  readonly title = input.required<string>();
  readonly text = input('');
}
