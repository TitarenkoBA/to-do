import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { Location, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Data, newNote } from '../core/data.service';
import { MediaService } from '../core/media.service';
import { Attachment, Note } from '../core/models';
import { Ui } from '../core/ui.service';
import { relDay, dateKey, uid, vibrate } from '../core/util';
import { Icon } from '../shared/icon';
import { Attachments, MediaThumb } from '../shared/media';
import { Empty, NOTE_COLORS, PageHeader } from '../shared/ui';

export const tint = (c: string, pct = 16) => (c ? `color-mix(in srgb, ${c} ${pct}%, var(--surface))` : null);

@Component({
  selector: 'app-notes',
  imports: [Icon, PageHeader, Empty, RouterLink, MediaThumb, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Заметки" [sub]="visible().length + ' ' + (archived() ? 'в архиве' : 'заметок')">
        <button class="btn-icon" [class.text-accent]="archived()" (click)="archived.set(!archived())" aria-label="Архив"><app-icon name="archive" /></button>
      </app-page-header>

      <label class="field mb-4">
        <app-icon name="search" [size]="18" class="text-muted" />
        <input class="flex-1 bg-transparent outline-none placeholder:text-muted" placeholder="Поиск по заметкам" [value]="q()"
          (input)="q.set($any($event.target).value)" />
      </label>

      @if (tags().length) {
        <div class="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
          @for (t of tags(); track t) {
            <button class="pill shrink-0" [class.!bg-accent]="tag() === t" [class.!text-white]="tag() === t" (click)="tag.set(tag() === t ? null : t)">#{{ t }}</button>
          }
        </div>
      }

      @if (pinned().length) {
        <h2 class="section-title"><app-icon name="pin" [size]="14" />Закреплённые</h2>
        <div class="masonry mb-6">
          @for (n of pinned(); track n.id) { <ng-container *ngTemplateOutlet="card; context: { $implicit: n }" /> }
        </div>
        @if (others().length) { <h2 class="section-title">Остальные</h2> }
      }
      <div class="masonry">
        @for (n of others(); track n.id) { <ng-container *ngTemplateOutlet="card; context: { $implicit: n }" /> }
      </div>
      @if (!visible().length) {
        <app-empty emoji="🗒️" [title]="archived() ? 'Архив пуст' : 'Нет заметок'" text="Идеи, списки покупок, голосовые мысли, фото — всё здесь">
          @if (!archived()) { <button class="btn btn-primary" (click)="create()"><app-icon name="plus" [size]="18" />Новая заметка</button> }
        </app-empty>
      }

      <ng-template #card let-n>
        <a [routerLink]="['/notes', n.id]" class="card mb-3 block break-inside-avoid overflow-hidden p-0 transition hover:shadow-md active:scale-[.98]"
          [style.background]="tint(n.color)" [style.border-color]="tint(n.color, 40)">
          @if (firstImage(n); as img) { <app-media-thumb [att]="img" class="max-h-48 w-full [&_img]:max-h-48" /> }
          <div class="space-y-1.5 p-3.5">
            @if (n.title) { <div class="font-semibold leading-snug">{{ n.title }}</div> }
            @if (n.body) { <p class="line-clamp-[8] text-sm whitespace-pre-line text-ink/80">{{ n.body }}</p> }
            @if (n.checklist.length) {
              <ul class="space-y-0.5 text-sm">
                @for (c of n.checklist.slice(0, 5); track c.id) {
                  <li class="flex items-center gap-2" [class.text-muted]="c.done" [class.line-through]="c.done">
                    <span class="size-3.5 shrink-0 rounded border border-current"></span>{{ c.title }}</li>
                }
                @if (n.checklist.length > 5) { <li class="text-xs text-muted">ещё {{ n.checklist.length - 5 }}…</li> }
              </ul>
            }
            <div class="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
              <span>{{ rel(n.updatedAt) }}</span>
              @if (count(n, 'audio')) { <span class="inline-flex items-center gap-0.5"><app-icon name="mic" [size]="12" />{{ count(n, 'audio') }}</span> }
              @if (count(n, 'video')) { <span class="inline-flex items-center gap-0.5"><app-icon name="video" [size]="12" />{{ count(n, 'video') }}</span> }
              @for (t of n.tags; track t) { <span class="text-accent">#{{ t }}</span> }
            </div>
          </div>
        </a>
      </ng-template>
    </div>
  `,
})
export class Notes {
  private data = inject(Data);
  private router = inject(Router);
  protected readonly q = signal('');
  protected readonly tag = signal<string | null>(null);
  protected readonly archived = signal(false);
  protected tint = tint;

  protected readonly visible = computed(() => {
    const q = this.q().toLowerCase().trim();
    const tag = this.tag();
    return this.data.notes
      .items()
      .filter((n) => n.archived === this.archived())
      .filter((n) => !tag || n.tags.includes(tag))
      .filter((n) => !q || (n.title + ' ' + n.body + ' ' + n.checklist.map((c) => c.title).join(' ')).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });
  protected readonly pinned = computed(() => this.visible().filter((n) => n.pinned));
  protected readonly others = computed(() => this.visible().filter((n) => !n.pinned));
  protected readonly tags = computed(() => [...new Set(this.data.notes.items().flatMap((n) => n.tags))].sort());

  firstImage = (n: Note) => n.attachments.find((a) => a.kind === 'image' || a.kind === 'video');
  count = (n: Note, k: string) => n.attachments.filter((a) => a.kind === k).length;
  rel = (ts: number) => relDay(dateKey(new Date(ts)));

  create() {
    const n = newNote();
    this.data.notes.upsert(n);
    this.router.navigate(['/notes', n.id]);
  }
}

@Component({
  selector: 'app-note-editor',
  imports: [Icon, Attachments],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (note(); as n) {
      <div class="page !pt-0 min-h-full" [style.background]="tint(n.color, 10)">
        <div class="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-1 bg-bg/80 px-2 py-2 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur md:-mx-8 md:px-6"
          [style.background]="tint(n.color, 10)">
          <button class="btn-icon" (click)="back()" aria-label="Назад"><app-icon name="chevron-left" /></button>
          <span class="flex-1 truncate text-sm text-muted">{{ saved() }}</span>
          <button class="btn-icon" [class.text-accent]="n.pinned" (click)="set({ pinned: !n.pinned })" aria-label="Закрепить"><app-icon name="pin" [fill]="n.pinned" /></button>
          <button class="btn-icon" (click)="colors.set(!colors())" aria-label="Цвет"><app-icon name="palette" /></button>
          <button class="btn-icon" (click)="toggleChecklist(n)" aria-label="Чек-лист"><app-icon name="check-square" /></button>
          <button class="btn-icon" (click)="share(n)" aria-label="Поделиться"><app-icon name="share" /></button>
          <button class="btn-icon" (click)="archive(n)" aria-label="Архив"><app-icon name="archive" /></button>
          <button class="btn-icon text-danger" (click)="remove(n)" aria-label="Удалить"><app-icon name="trash" /></button>
        </div>
        @if (colors()) {
          <div class="mb-4 flex flex-wrap gap-2 anim-fade">
            @for (c of noteColors; track c) {
              <button class="grid size-9 place-items-center rounded-full border border-line" [style.background]="c || 'var(--surface)'"
                (click)="set({ color: c })">@if (n.color === c) { <app-icon name="check" [size]="16" [class.text-white]="!!c" /> }</button>
            }
          </div>
        }
        <div class="mx-auto max-w-3xl space-y-4">
          <input class="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted" placeholder="Заголовок"
            [value]="n.title" (input)="set({ title: $any($event.target).value })" />
          <textarea class="autogrow min-h-40 w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted"
            placeholder="Начни писать…" [value]="n.body" (input)="set({ body: $any($event.target).value })"></textarea>

          @if (n.checklist.length || checklistOn()) {
            <section class="space-y-1">
              @for (c of n.checklist; track c.id) {
                <div class="flex items-center gap-3">
                  <button class="checkbox !size-5" [class.checked]="c.done" (click)="toggleItem(n, c.id)"><app-icon name="check" [size]="12" [stroke]="3" /></button>
                  <input class="flex-1 bg-transparent py-1.5 outline-none" [class.line-through]="c.done" [class.text-muted]="c.done" [value]="c.title"
                    (change)="renameItem(n, c.id, $any($event.target).value)" />
                  <button class="btn-icon !size-8 text-muted" (click)="removeItem(n, c.id)"><app-icon name="x" [size]="16" /></button>
                </div>
              }
              <div class="flex items-center gap-3">
                <span class="grid size-5 place-items-center text-muted"><app-icon name="plus" [size]="16" /></span>
                <input #item class="flex-1 bg-transparent py-1.5 outline-none placeholder:text-muted" placeholder="Пункт списка"
                  enterkeyhint="enter" (keydown.enter)="addItem(n, item)" />
              </div>
            </section>
          }

          <app-attachments [items]="n.attachments" (changed)="setAtt($event)" />

          <div class="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <app-icon name="tag" [size]="16" class="text-muted" />
            @for (t of n.tags; track t) { <button class="chip chip-on" (click)="set({ tags: without(n.tags, t) })">#{{ t }} <app-icon name="x" [size]="12" /></button> }
            <input #tagInp class="min-w-24 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted" placeholder="добавить тег"
              (keydown.enter)="addTag(n, tagInp)" (blur)="addTag(n, tagInp)" />
          </div>
        </div>
      </div>
    }
  `,
})
export class NoteEditor implements OnDestroy {
  private data = inject(Data);
  private ui = inject(Ui);
  private media = inject(MediaService);
  private router = inject(Router);
  private location = inject(Location);
  readonly id = input.required<string>();
  protected readonly note = computed(() => this.data.notes.get(this.id()));
  protected readonly colors = signal(false);
  protected readonly checklistOn = signal(false);
  protected readonly noteColors = NOTE_COLORS;
  protected tint = tint;
  protected readonly saved = computed(() => {
    const n = this.note();
    return n ? 'Изменено ' + new Date(n.updatedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  });
  private deleted = false;

  without = (arr: string[], v: string) => arr.filter((x) => x !== v);

  set(p: Partial<Note>) {
    const n = this.note();
    if (n) this.data.notes.upsert({ ...n, ...p, updatedAt: Date.now() });
  }

  toggleChecklist(n: Note) {
    if (n.checklist.length) return;
    if (n.body.trim()) {
      const items = n.body.split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
      this.set({ body: '', checklist: items.map((title) => ({ id: uid(), title, done: false })) });
    } else this.checklistOn.set(!this.checklistOn());
  }
  addItem(n: Note, el: HTMLInputElement) {
    const v = el.value.trim();
    if (!v) return;
    el.value = '';
    this.set({ checklist: [...n.checklist, { id: uid(), title: v, done: false }] });
  }
  toggleItem(n: Note, id: string) {
    vibrate(8);
    this.set({ checklist: n.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) });
  }
  renameItem(n: Note, id: string, title: string) {
    this.set({ checklist: n.checklist.map((c) => (c.id === id ? { ...c, title } : c)) });
  }
  removeItem(n: Note, id: string) {
    this.set({ checklist: n.checklist.filter((c) => c.id !== id) });
  }
  addTag(n: Note, el: HTMLInputElement) {
    const v = el.value.trim().replace(/^#/, '').toLowerCase();
    el.value = '';
    if (v && !n.tags.includes(v)) this.set({ tags: [...n.tags, v] });
  }
  setAtt(a: Attachment[]) {
    this.set({ attachments: a });
  }

  async share(n: Note) {
    const text = [n.title, n.body, ...n.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.title}`)].filter(Boolean).join('\n');
    if (navigator.share) await navigator.share({ title: n.title, text }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(text);
      this.ui.toast('Скопировано в буфер обмена');
    }
  }

  archive(n: Note) {
    this.set({ archived: !n.archived });
    this.ui.toast(n.archived ? 'Возвращено из архива' : 'Перемещено в архив');
    this.back();
  }

  async remove(n: Note) {
    if (!(await this.ui.confirm('Удалить заметку?', { ok: 'Удалить', danger: true }))) return;
    this.deleted = true;
    await this.media.remove(n.attachments);
    this.data.notes.remove(n.id);
    this.back();
  }

  back() {
    if (history.length > 1) this.location.back();
    else this.router.navigateByUrl('/notes');
  }

  ngOnDestroy() {
    const n = this.note();
    if (!this.deleted && n && !n.title.trim() && !n.body.trim() && !n.checklist.length && !n.attachments.length) {
      this.data.notes.remove(n.id);
    }
  }
}
