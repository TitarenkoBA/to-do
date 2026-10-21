import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { Icon } from './icon';

/** Bottom sheet on phones, centered dialog on desktop. Swipe the handle down to close. */
@Component({
  selector: 'app-sheet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'open() && close()', '(window:popstate)': 'onPop()' },
  template: `
    @if (open()) {
      <div class="sheet-backdrop" (click)="close()"></div>
      <div class="sheet" [class.sheet-wide]="wide()" role="dialog" aria-modal="true"
        [style.transform]="dy() > 0 ? 'translateY(' + dy() + 'px)' : null"
        [style.transition]="dragging ? 'none' : null">
        <div class="touch-none select-none" (pointerdown)="down($event)" (pointermove)="move($event)"
          (pointerup)="up()" (pointercancel)="up()">
          <div class="mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-line md:hidden"></div>
          @if (title()) {
            <div class="flex items-center gap-2 px-5 pt-2 pb-1 md:pt-5">
              <h2 class="flex-1 text-lg font-bold">{{ title() }}</h2>
              <button class="btn-icon" (click)="close()" aria-label="Закрыть"><app-icon name="x" /></button>
            </div>
          }
        </div>
        <div class="sheet-body"><ng-content /></div>
      </div>
    }
  `,
})
export class Sheet {
  readonly open = input(false);
  readonly title = input('');
  readonly wide = input(false);
  readonly closed = output<void>();
  protected readonly dy = signal(0);
  protected dragging = false;
  private startY = 0;

  private pushed = false;

  constructor() {
    // An extra history entry lets the phone's Back button close the sheet instead of leaving the page.
    effect(() => {
      const open = this.open();
      document.body.classList.toggle('no-scroll', open);
      untracked(() => {
        if (open && !this.pushed) {
          history.pushState({ ...history.state, ritmSheet: true }, '');
          this.pushed = true;
        } else if (!open && this.pushed) {
          this.pushed = false;
          if (history.state?.ritmSheet) history.back();
        }
      });
    });
  }

  onPop() {
    if (this.pushed && !history.state?.ritmSheet) {
      this.pushed = false;
      this.close();
    }
  }

  close() {
    this.dy.set(0);
    this.closed.emit();
  }

  down(e: PointerEvent) {
    if (innerWidth >= 768 || (e.target as HTMLElement).closest('button')) return;
    this.dragging = true;
    this.startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  move(e: PointerEvent) {
    if (this.dragging) this.dy.set(Math.max(0, e.clientY - this.startY));
  }
  up() {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dy() > 110) this.close();
    else this.dy.set(0);
  }
}
