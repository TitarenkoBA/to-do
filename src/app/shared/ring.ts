import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, viewChild } from '@angular/core';
import { Ui } from '../core/ui.service';

@Component({
  selector: 'app-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-grid place-items-center' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()" class="-rotate-90">
      <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" [attr.stroke-width]="width()" class="stroke-line/70" />
      <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" [attr.stroke-width]="width()" stroke-linecap="round"
        [attr.stroke]="color()" [attr.stroke-dasharray]="len()" [attr.stroke-dashoffset]="offset()"
        style="transition: stroke-dashoffset .5s cubic-bezier(.3,.7,.3,1)" />
    </svg>
    <div class="absolute inset-0 grid place-items-center"><ng-content /></div>
  `,
})
export class Ring {
  readonly value = input(0);
  readonly size = input(56);
  readonly width = input(6);
  readonly color = input('var(--accent)');
  protected readonly c = computed(() => this.size() / 2);
  protected readonly r = computed(() => this.size() / 2 - this.width() / 2 - 1);
  protected readonly len = computed(() => 2 * Math.PI * this.r());
  protected readonly offset = computed(() => this.len() * (1 - Math.min(1, Math.max(0, this.value()))));
}

/** Lightweight canvas confetti, triggered by Ui.celebrate(). */
@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c class="pointer-events-none fixed inset-0 z-[90] size-full"></canvas>`,
})
export class Confetti {
  private ui = inject(Ui);
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');
  private first = true;

  constructor() {
    effect(() => {
      this.ui.confetti();
      if (this.first) {
        this.first = false;
        return;
      }
      this.burst();
    });
  }

  private burst() {
    const cv = this.canvas().nativeElement;
    const dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const colors = ['#7c5cff', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#ef4444'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.55,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 16 - 6,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now();
    const frame = (t: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.38;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - (t - t0) / 2600);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t - t0 < 2600) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(frame);
  }
}
