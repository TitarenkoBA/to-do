import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Data, newEntry } from '../core/data.service';
import { MediaService } from '../core/media.service';
import { Attachment, JournalEntry, Mood } from '../core/models';
import { Ui } from '../core/ui.service';
import { MONTHS, MONTHS_SHORT, WEEKDAYS_SHORT, addDays, longDate, parseKey, uid, vibrate } from '../core/util';
import { Icon } from '../shared/icon';
import { Attachments, MediaThumb } from '../shared/media';
import { Empty, JOURNAL_PROMPTS, MOODS, PageHeader } from '../shared/ui';

@Component({
  selector: 'app-journal',
  imports: [Icon, PageHeader, Empty, RouterLink, MediaThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-page-header title="Дневник" [sub]="streak() ? '🔥 ' + streak() + ' дн. подряд' : entries().length + ' записей'">
        <button class="btn-icon" [class.text-accent]="view() === 'year'" (click)="view.set(view() === 'year' ? 'list' : 'year')"
          aria-label="Год в пикселях" title="Год в пикселях"><app-icon name="grid" /></button>
      </app-page-header>

      <section class="card mb-5">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="font-semibold">Настроение · 30 дней</h2>
          @if (avg(); as a) { <span class="text-sm text-muted">в среднем {{ moods[a - 1].e }}</span> }
        </div>
        <div class="flex h-24 items-end gap-[3px]">
          @for (d of last30(); track d.key) {
            <div class="flex-1 rounded-t-md transition-all" [style.height.%]="d.mood ? d.mood * 20 : 4"
              [style.background]="d.mood ? moods[d.mood - 1].c : 'var(--line)'" [title]="d.key"></div>
          }
        </div>
      </section>

      @if (view() === 'year') {
        <section class="card mb-5 overflow-x-auto">
          <div class="mb-3 flex items-center gap-2">
            <button class="btn-icon" (click)="year.set(year() - 1)"><app-icon name="chevron-left" /></button>
            <h2 class="flex-1 text-center font-bold">Год в пикселях · {{ year() }}</h2>
            <button class="btn-icon" (click)="year.set(year() + 1)"><app-icon name="chevron-right" /></button>
          </div>
          <div class="mx-auto grid w-max grid-cols-[auto_repeat(12,1fr)] gap-[3px] text-[10px] text-muted">
            <span></span>
            @for (m of monthsShort; track m) { <span class="text-center">{{ m.slice(0, 1).toUpperCase() }}</span> }
            @for (d of days31; track d) {
              <span class="pr-1 text-right leading-[16px]">{{ d % 5 === 0 || d === 1 ? d : '' }}</span>
              @for (m of monthsShort; track $index) {
                @let px = pixel($index, d);
                <button class="size-4 rounded-[4px] sm:size-5" [class.invisible]="px.invalid" [style.background]="px.color"
                  (click)="px.entry && open(px.entry.id)" [title]="px.key"></button>
              }
            }
          </div>
          <div class="mt-3 flex flex-wrap justify-center gap-3 text-xs">
            @for (m of moods; track m.v) { <span class="flex items-center gap-1"><span class="size-3 rounded" [style.background]="m.c"></span>{{ m.l }}</span> }
          </div>
        </section>
      }

      @for (g of grouped(); track g.title) {
        <h2 class="section-title capitalize">{{ g.title }}</h2>
        <div class="mb-5 space-y-3">
          @for (e of g.items; track e.id) {
            <a [routerLink]="['/journal', e.id]" class="card flex gap-4 transition active:scale-[.99]">
              <div class="w-11 shrink-0 text-center">
                <div class="text-2xl leading-none font-extrabold">{{ day(e.date) }}</div>
                <div class="text-xs text-muted uppercase">{{ wd(e.date) }}</div>
                <div class="mt-1 text-2xl">{{ e.mood ? moods[e.mood - 1].e : '📝' }}</div>
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold">{{ e.title || (e.mood ? moods[e.mood - 1].l : 'Запись') }}</div>
                @if (e.body) { <p class="mt-0.5 line-clamp-3 text-sm whitespace-pre-line text-muted">{{ e.body }}</p> }
                @if (visuals(e).length) {
                  <div class="mt-2 flex gap-1.5">
                    @for (a of visuals(e); track a.id) { <app-media-thumb [att]="a" class="size-14 rounded-lg" /> }
                  </div>
                }
                @if (audioCount(e)) { <div class="mt-1.5 inline-flex items-center gap-1 text-xs text-muted"><app-icon name="mic" [size]="12" />{{ audioCount(e) }} голосовых</div> }
              </div>
            </a>
          }
        </div>
      } @empty {
        <app-empty emoji="📔" title="Дневник пуст" text="Записывай мысли, настроение, фото и голосовые — каждый день станет историей">
          <button class="btn btn-primary" (click)="write()"><app-icon name="edit" [size]="18" />Первая запись</button>
        </app-empty>
      }
    </div>
  `,
})
export class Journal {
  private data = inject(Data);
  private router = inject(Router);
  protected readonly moods = MOODS;
  protected readonly monthsShort = MONTHS_SHORT;
  protected readonly days31 = Array.from({ length: 31 }, (_, i) => i + 1);
  protected readonly view = signal<'list' | 'year'>('list');
  protected readonly year = signal(new Date().getFullYear());

  protected readonly entries = computed(() =>
    [...this.data.journal.items()].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
  );
  private readonly byDate = computed(() => {
    const m = new Map<string, JournalEntry>();
    for (const e of this.entries()) if (!m.has(e.date) || e.mood) m.set(e.date, e);
    return m;
  });
  protected readonly grouped = computed(() => {
    const out: { title: string; items: JournalEntry[] }[] = [];
    for (const e of this.entries()) {
      const d = parseKey(e.date);
      const title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (out.at(-1)?.title !== title) out.push({ title, items: [] });
      out.at(-1)!.items.push(e);
    }
    return out;
  });
  protected readonly last30 = computed(() => {
    const t = this.data.today();
    return Array.from({ length: 30 }, (_, i) => {
      const key = addDays(t, i - 29);
      return { key, mood: this.byDate().get(key)?.mood ?? 0 };
    });
  });
  protected readonly avg = computed(() => {
    const m = this.last30().filter((d) => d.mood);
    return m.length ? Math.round(m.reduce((a, d) => a + d.mood, 0) / m.length) : 0;
  });
  protected readonly streak = computed(() => {
    let k = this.data.today();
    if (!this.byDate().has(k)) k = addDays(k, -1);
    let n = 0;
    while (this.byDate().has(k)) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  });

  pixel(month: number, day: number) {
    const d = new Date(this.year(), month, day);
    const invalid = d.getMonth() !== month;
    const key = `${this.year()}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = invalid ? undefined : this.byDate().get(key);
    const color = entry?.mood ? MOODS[entry.mood - 1].c : entry ? 'var(--muted)' : 'var(--surface-2)';
    return { invalid, key, entry, color };
  }

  day = (k: string) => parseKey(k).getDate();
  wd = (k: string) => WEEKDAYS_SHORT[parseKey(k).getDay()];
  visuals = (e: JournalEntry) => e.attachments.filter((a) => a.kind !== 'audio').slice(0, 4);
  audioCount = (e: JournalEntry) => e.attachments.filter((a) => a.kind === 'audio').length;

  open(id: string) {
    this.router.navigate(['/journal', id]);
  }

  write() {
    const existing = this.data.journal.items().find((e) => e.date === this.data.today());
    if (existing) return this.open(existing.id);
    const e = newEntry(this.data.today());
    this.data.journal.upsert(e);
    this.open(e.id);
  }
}

@Component({
  selector: 'app-journal-editor',
  imports: [Icon, Attachments],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entry(); as e) {
      <div class="page !pt-0">
        <div class="sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-1 bg-bg/85 px-2 py-2 pt-[max(var(--sa-top),8px)] backdrop-blur md:-mx-8 md:px-6">
          <button class="btn-icon" (click)="back()" aria-label="Назад"><app-icon name="chevron-left" /></button>
          <label class="relative flex-1 truncate font-semibold first-letter:uppercase">
            {{ long(e.date) }}
            <input type="date" class="absolute inset-0 opacity-0" [value]="e.date" (change)="setDate($any($event.target).value)" />
          </label>
          <button class="btn-icon text-danger" (click)="remove(e)" aria-label="Удалить"><app-icon name="trash" /></button>
        </div>

        <div class="mx-auto max-w-3xl space-y-5">
          <div class="flex justify-between gap-1 rounded-3xl bg-surface p-2">
            @for (m of moods; track m.v) {
              <button class="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 transition active:scale-90"
                [style.background]="e.mood === m.v ? m.c + '26' : null" (click)="setMood(m.v)">
                <span class="text-3xl transition" [class.scale-125]="e.mood === m.v" [class.grayscale]="e.mood && e.mood !== m.v">{{ m.e }}</span>
                <span class="text-[11px] font-medium" [style.color]="e.mood === m.v ? m.c : 'var(--muted)'">{{ m.l }}</span>
              </button>
            }
          </div>

          <button class="flex w-full items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-3 text-left text-sm text-muted transition hover:border-accent"
            (click)="usePrompt(e)">
            <app-icon name="sparkles" [size]="16" class="text-accent" />
            <span class="flex-1">{{ prompt() }}</span>
            <span role="button" class="btn-icon !size-8" (click)="shuffle($event)" aria-label="Другой вопрос">🎲</span>
          </button>

          <input class="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted" placeholder="Заголовок дня"
            [value]="e.title" (input)="set({ title: $any($event.target).value })" />
          <textarea #body class="autogrow min-h-52 w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted"
            placeholder="Как прошёл день? Что чувствуешь?" [value]="e.body" (input)="set({ body: $any($event.target).value })"></textarea>

          <section class="space-y-2">
            <div class="label">Фото, видео, голос</div>
            <app-attachments [items]="e.attachments" (changed)="setAtt($event)" />
          </section>

          <div class="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <app-icon name="tag" [size]="16" class="text-muted" />
            @for (t of e.tags; track t) { <button class="chip chip-on" (click)="removeTag(e, t)">#{{ t }} <app-icon name="x" [size]="12" /></button> }
            <input #tagInp class="min-w-24 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted" placeholder="добавить тег"
              (keydown.enter)="addTag(e, tagInp)" (blur)="addTag(e, tagInp)" />
          </div>
          <p class="pb-4 text-center text-xs text-muted">{{ words() }} · сохраняется автоматически</p>
        </div>
      </div>
    }
  `,
})
export class JournalEditor implements OnDestroy {
  private data = inject(Data);
  private ui = inject(Ui);
  private media = inject(MediaService);
  private router = inject(Router);
  private location = inject(Location);
  readonly id = input.required<string>();
  protected readonly entry = computed(() => this.data.journal.get(this.id()));
  protected readonly moods = MOODS;
  protected readonly prompt = signal(JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)]);
  protected readonly words = computed(() => {
    const n = (this.entry()?.body.match(/\S+/g) ?? []).length;
    return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'слово' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'слова' : 'слов'}`;
  });
  protected long = longDate;
  private deleted = false;

  set(p: Partial<JournalEntry>) {
    const e = this.entry();
    if (e) this.data.journal.upsert({ ...e, ...p, updatedAt: Date.now() });
  }
  setMood(m: number) {
    vibrate(10);
    this.set({ mood: m as Mood });
  }
  setDate(d: string) {
    if (d) this.set({ date: d });
  }
  setAtt(a: Attachment[]) {
    this.set({ attachments: a });
  }
  shuffle(ev: Event) {
    ev.stopPropagation();
    const others = JOURNAL_PROMPTS.filter((p) => p !== this.prompt());
    this.prompt.set(others[Math.floor(Math.random() * others.length)]);
  }
  usePrompt(e: JournalEntry) {
    this.set({ body: (e.body ? e.body.trimEnd() + '\n\n' : '') + this.prompt() + '\n' });
  }
  addTag(e: JournalEntry, el: HTMLInputElement) {
    const v = el.value.trim().replace(/^#/, '').toLowerCase();
    el.value = '';
    if (v && !e.tags.includes(v)) this.set({ tags: [...e.tags, v] });
  }
  removeTag(e: JournalEntry, t: string) {
    this.set({ tags: e.tags.filter((x) => x !== t) });
  }
  async remove(e: JournalEntry) {
    if (!(await this.ui.confirm('Удалить запись?', { ok: 'Удалить', danger: true }))) return;
    this.deleted = true;
    await this.media.remove(e.attachments);
    this.data.journal.remove(e.id);
    this.back();
  }
  back() {
    if (history.length > 1) this.location.back();
    else this.router.navigateByUrl('/journal');
  }
  ngOnDestroy() {
    const e = this.entry();
    if (!this.deleted && e && !e.mood && !e.title.trim() && !e.body.trim() && !e.attachments.length) this.data.journal.remove(e.id);
  }
}
