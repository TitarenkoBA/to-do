import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { MediaService } from '../core/media.service';
import { Attachment } from '../core/models';
import { SoundService } from '../core/sound.service';
import { Ui } from '../core/ui.service';
import { downloadBlob, mmss, vibrate } from '../core/util';
import { Icon } from './icon';

@Component({
  selector: 'app-media-thumb',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block relative overflow-hidden bg-surface-2' },
  template: `
    @if (url(); as u) {
      @if (att().kind === 'image') {
        <img [src]="u" alt="" loading="lazy" class="size-full object-cover" />
      } @else if (att().kind === 'video') {
        <video [src]="u + '#t=0.1'" preload="metadata" muted playsinline class="size-full object-cover"></video>
        <div class="absolute inset-0 grid place-items-center bg-black/20 text-white">
          <span class="grid size-9 place-items-center rounded-full bg-black/40 backdrop-blur"><app-icon name="play" [size]="16" [fill]="true" /></span>
        </div>
        @if (att().duration) {
          <span class="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{{ dur() }}</span>
        }
      } @else {
        <div class="grid size-full place-items-center text-muted"><app-icon name="mic" /></div>
      }
    }
  `,
})
export class MediaThumb {
  private media = inject(MediaService);
  readonly att = input.required<Attachment>();
  protected readonly url = signal<string | null>(null);
  protected readonly dur = computed(() => mmss((this.att().duration ?? 0) * 1000));
  constructor() {
    effect(() => {
      const id = this.att().id;
      this.media.url(id).then((u) => this.url.set(u));
    });
  }
}

@Component({
  selector: 'app-audio-player',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-3 rounded-2xl bg-surface-2 p-2 pr-3' },
  template: `
    <button class="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white active:scale-95 transition"
      (click)="toggle()" [attr.aria-label]="playing() ? 'Пауза' : 'Играть'">
      <app-icon [name]="playing() ? 'pause' : 'play'" [size]="18" [fill]="true" [stroke]="0" />
    </button>
    <div class="flex h-9 flex-1 cursor-pointer items-center gap-[3px]" (click)="seek($event)">
      @for (h of bars(); track $index) {
        <span class="w-full flex-1 rounded-full transition-colors" [style.height.%]="h"
          [class]="$index / bars().length < progress() ? 'bg-accent' : 'bg-line'"></span>
      }
    </div>
    <span class="w-11 text-right text-xs tabular-nums text-muted">{{ label() }}</span>
    <audio #el [src]="url()" preload="metadata" (timeupdate)="cur.set(el.currentTime)" (ended)="playing.set(false); cur.set(0)"
      (loadedmetadata)="meta(el)"></audio>
  `,
})
export class AudioPlayer implements OnDestroy {
  private media = inject(MediaService);
  readonly att = input.required<Attachment>();
  protected readonly url = signal<string>('');
  protected readonly playing = signal(false);
  protected readonly cur = signal(0);
  protected readonly len = signal(0);
  private el = viewChild.required<ElementRef<HTMLAudioElement>>('el');

  protected readonly bars = computed(() => {
    let seed = [...this.att().id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    return Array.from({ length: 32 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return 25 + (seed % 75);
    });
  });
  protected readonly progress = computed(() => (this.len() ? this.cur() / this.len() : 0));
  protected readonly label = computed(() => mmss(((this.playing() || this.cur() ? this.len() - this.cur() : this.len()) || 0) * 1000));

  constructor() {
    effect(() => {
      const a = this.att();
      this.len.set(a.duration ?? 0);
      this.media.url(a.id).then((u) => this.url.set(u ?? ''));
    });
  }

  meta(el: HTMLAudioElement) {
    if (isFinite(el.duration) && el.duration > 0) this.len.set(el.duration);
  }

  toggle() {
    const el = this.el().nativeElement;
    if (el.paused) {
      document.querySelectorAll('audio').forEach((a) => a !== el && a.pause());
      el.play().then(() => this.playing.set(true)).catch(() => {});
      el.onpause = () => this.playing.set(false);
    } else el.pause();
  }

  seek(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const el = this.el().nativeElement;
    if (this.len()) el.currentTime = ((e.clientX - r.left) / r.width) * this.len();
  }

  ngOnDestroy() {
    this.el()?.nativeElement.pause();
  }
}

@Component({
  selector: 'app-audio-recorder',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-2 pr-3 anim-pop' },
  template: `
    <button class="btn-icon text-muted" (click)="cancel()" aria-label="Отмена"><app-icon name="trash" [size]="18" /></button>
    <span class="size-2.5 shrink-0 animate-pulse rounded-full bg-danger"></span>
    <span class="w-12 text-sm font-semibold tabular-nums">{{ time() }}</span>
    <div class="flex h-9 flex-1 items-center justify-end gap-[3px] overflow-hidden">
      @for (l of levels(); track $index) {
        <span class="w-[3px] shrink-0 rounded-full bg-danger/70" [style.height.%]="10 + l * 90"></span>
      }
    </div>
    <button class="grid size-10 shrink-0 place-items-center rounded-full bg-danger text-white active:scale-95 transition"
      (click)="stop()" aria-label="Готово"><app-icon name="check" [size]="20" /></button>
  `,
})
export class AudioRecorder implements OnDestroy {
  private media = inject(MediaService);
  private sound = inject(SoundService);
  private ui = inject(Ui);
  readonly done = output<Attachment>();
  readonly cancelled = output<void>();
  protected readonly levels = signal<number[]>([]);
  protected readonly elapsed = signal(0);
  protected readonly time = computed(() => mmss(this.elapsed()));
  private rec?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private raf = 0;
  private t0 = 0;
  private discard = false;

  constructor() {
    this.begin();
  }

  private async begin() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.ui.toast('Нет доступа к микрофону');
      this.cancelled.emit();
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = async () => {
      this.cleanup();
      if (this.discard) return;
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType || mime || 'audio/webm' });
      const att = await this.media.add(blob, 'Голосовая заметка', this.elapsed() / 1000);
      this.done.emit(att);
    };
    this.rec.start(250);
    vibrate(20);
    this.t0 = performance.now();

    const ctx = this.sound.ac();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(this.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let last = 0;
    const draw = (t: number) => {
      this.raf = requestAnimationFrame(draw);
      this.elapsed.set(performance.now() - this.t0);
      if (t - last < 60) return;
      last = t;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      this.levels.update((l) => [...l.slice(-47), rms]);
    };
    this.raf = requestAnimationFrame(draw);
  }

  stop() {
    vibrate(20);
    if (this.rec?.state === 'recording') this.rec.stop();
  }

  cancel() {
    this.discard = true;
    if (this.rec?.state === 'recording') this.rec.stop();
    else this.cleanup();
    this.cancelled.emit();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  ngOnDestroy() {
    if (this.rec?.state === 'recording') this.rec.stop();
    else this.cleanup();
  }
}

/** Attachment gallery + capture buttons (camera, video, gallery, voice). */
@Component({
  selector: 'app-attachments',
  imports: [Icon, MediaThumb, AudioPlayer, AudioRecorder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-3' },
  template: `
    @if (visual().length) {
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
        @for (a of visual(); track a.id; let i = $index) {
          <div class="relative">
            <app-media-thumb [att]="a" class="aspect-square cursor-pointer rounded-xl" (click)="view(i)" />
            @if (editable()) {
              <button class="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/55 text-white"
                (click)="remove(a)" aria-label="Удалить"><app-icon name="x" [size]="14" /></button>
            }
          </div>
        }
      </div>
    }
    @for (a of audio(); track a.id) {
      <div class="flex items-center gap-1">
        <app-audio-player [att]="a" class="flex-1" />
        @if (editable()) {
          <button class="btn-icon text-muted" (click)="remove(a)" aria-label="Удалить"><app-icon name="trash" [size]="18" /></button>
        }
      </div>
    }
    @if (recording()) {
      <app-audio-recorder (done)="added([$event]); recording.set(false)" (cancelled)="recording.set(false)" />
    }
    @if (busy()) {
      <div class="flex items-center gap-2 text-sm text-muted"><span class="spinner"></span> Сохраняю…</div>
    }
    @if (editable() && !recording()) {
      <div class="flex flex-wrap gap-2">
        <button class="chip" (click)="cam.click()"><app-icon name="camera" [size]="16" /> Фото</button>
        <button class="chip" (click)="vid.click()"><app-icon name="video" [size]="16" /> Видео</button>
        <button class="chip" (click)="gal.click()"><app-icon name="image" [size]="16" /> Галерея</button>
        <button class="chip" (click)="recording.set(true)"><app-icon name="mic" [size]="16" /> Голос</button>
      </div>
    }
    <input #cam type="file" accept="image/*" capture="environment" hidden (change)="files($event)" />
    <input #vid type="file" accept="video/*" capture="environment" hidden (change)="files($event)" />
    <input #gal type="file" accept="image/*,video/*,audio/*" multiple hidden (change)="files($event)" />
  `,
})
export class Attachments {
  private media = inject(MediaService);
  private ui = inject(Ui);
  readonly items = input<Attachment[]>([]);
  readonly editable = input(true);
  readonly changed = output<Attachment[]>();
  protected readonly recording = signal(false);
  protected readonly busy = signal(false);
  protected readonly visual = computed(() => this.items().filter((a) => a.kind === 'image' || a.kind === 'video'));
  protected readonly audio = computed(() => this.items().filter((a) => a.kind === 'audio'));

  startRecording() {
    this.recording.set(true);
  }

  async files(e: Event) {
    const input = e.target as HTMLInputElement;
    const list = [...(input.files ?? [])];
    input.value = '';
    if (!list.length) return;
    this.busy.set(true);
    try {
      const atts: Attachment[] = [];
      for (const f of list) atts.push(await this.media.add(f, f.name));
      this.added(atts);
    } catch {
      this.ui.toast('Не удалось сохранить файл — возможно, не хватает места');
    } finally {
      this.busy.set(false);
    }
  }

  added(atts: Attachment[]) {
    this.changed.emit([...this.items(), ...atts]);
  }

  async remove(a: Attachment) {
    if (!(await this.ui.confirm('Удалить вложение?', { ok: 'Удалить', danger: true }))) return;
    await this.media.remove([a]);
    this.changed.emit(this.items().filter((x) => x.id !== a.id));
  }

  view(i: number) {
    this.ui.viewer.set({ items: this.visual(), index: i });
  }
}

@Component({
  selector: 'app-viewer',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'key($event)' },
  template: `
    @if (ui.viewer(); as v) {
      <div class="fixed inset-0 z-[80] flex flex-col bg-black/95 text-white anim-fade" (pointerdown)="sx = $event.clientX"
        (pointerup)="swipe($event)">
        <div class="flex items-center gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)]">
          <span class="flex-1 text-sm text-white/70">{{ v.index + 1 }} / {{ v.items.length }}</span>
          <button class="btn-icon text-white" (click)="save()" aria-label="Сохранить"><app-icon name="download" /></button>
          <button class="btn-icon text-white" (click)="close()" aria-label="Закрыть"><app-icon name="x" /></button>
        </div>
        <div class="relative flex min-h-0 flex-1 items-center justify-center">
          @if (url(); as u) {
            @if (current()?.kind === 'video') {
              <video [src]="u" controls autoplay playsinline class="max-h-full max-w-full"></video>
            } @else {
              <img [src]="u" alt="" class="max-h-full max-w-full object-contain anim-pop" />
            }
          }
          @if (v.items.length > 1) {
            <button class="absolute left-2 hidden size-11 place-items-center rounded-full bg-white/10 md:grid" (click)="go(-1)">
              <app-icon name="chevron-left" /></button>
            <button class="absolute right-2 hidden size-11 place-items-center rounded-full bg-white/10 md:grid" (click)="go(1)">
              <app-icon name="chevron-right" /></button>
          }
        </div>
        <div class="h-[env(safe-area-inset-bottom)]"></div>
      </div>
    }
  `,
})
export class Viewer {
  protected ui = inject(Ui);
  private media = inject(MediaService);
  protected readonly url = signal<string | null>(null);
  protected readonly current = computed(() => {
    const v = this.ui.viewer();
    return v ? v.items[v.index] : null;
  });
  sx = 0;

  constructor() {
    effect(() => {
      const c = this.current();
      this.url.set(null);
      if (c) this.media.url(c.id).then((u) => this.url.set(u));
    });
  }

  close() {
    this.ui.viewer.set(null);
  }

  go(d: number) {
    const v = this.ui.viewer();
    if (!v) return;
    this.ui.viewer.set({ ...v, index: (v.index + d + v.items.length) % v.items.length });
  }

  swipe(e: PointerEvent) {
    const dx = e.clientX - this.sx;
    if (Math.abs(dx) > 60) this.go(dx < 0 ? 1 : -1);
  }

  key(e: KeyboardEvent) {
    if (!this.ui.viewer()) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowLeft') this.go(-1);
    if (e.key === 'ArrowRight') this.go(1);
  }

  async save() {
    const c = this.current();
    if (!c) return;
    if (await this.media.share(c)) return;
    const b = await this.media.blob(c.id);
    if (b) downloadBlob(b, c.name || `ritm-${c.id}.${c.mime.split('/')[1]?.split(';')[0] ?? 'bin'}`);
  }
}
