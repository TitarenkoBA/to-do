import { Injectable, signal } from '@angular/core';
import { Attachment } from './models';

export interface Toast {
  id: number;
  text: string;
  icon?: string;
  action?: string;
  fn?: () => void;
}

export interface ConfirmReq {
  title: string;
  text?: string;
  ok: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class Ui {
  readonly toasts = signal<Toast[]>([]);
  readonly confirmReq = signal<ConfirmReq | null>(null);
  readonly taskId = signal<string | null>(null);
  readonly quickAdd = signal<{ due?: string; listId?: string } | null>(null);
  readonly search = signal(false);
  readonly viewer = signal<{ items: Attachment[]; index: number } | null>(null);
  readonly confetti = signal(0);
  private seq = 0;

  toast(text: string, o: { icon?: string; action?: string; fn?: () => void; ms?: number } = {}) {
    const id = ++this.seq;
    this.toasts.update((t) => [...t.slice(-2), { id, text, icon: o.icon, action: o.action, fn: o.fn }]);
    setTimeout(() => this.dismiss(id), o.ms ?? (o.action ? 5000 : 2800));
  }

  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  confirm(title: string, o: { text?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) =>
      this.confirmReq.set({ title, text: o.text, ok: o.ok ?? 'OK', danger: o.danger ?? false, resolve }),
    );
  }

  openTask(id: string) {
    this.taskId.set(id);
  }

  celebrate() {
    this.confetti.update((n) => n + 1);
  }
}
