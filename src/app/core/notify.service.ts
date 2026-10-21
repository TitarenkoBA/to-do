import { Injectable, signal } from '@angular/core';

declare const TimestampTrigger: { new (ts: number): unknown } | undefined;

@Injectable({ providedIn: 'root' })
export class Notifier {
  readonly supported = typeof Notification !== 'undefined';
  readonly permission = signal<NotificationPermission>(this.supported ? Notification.permission : 'denied');
  /** Notification Triggers: scheduled notifications even when the app is closed (Chromium flag/origin-trial). */
  readonly triggers =
    this.supported && 'showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined';

  async request(): Promise<boolean> {
    if (!this.supported) return false;
    const p = await Notification.requestPermission();
    this.permission.set(p);
    return p === 'granted';
  }

  private async reg() {
    try {
      return (await navigator.serviceWorker?.getRegistration()) ?? null;
    } catch {
      return null;
    }
  }

  async show(title: string, body: string, o: { tag?: string; url?: string; sticky?: boolean } = {}) {
    if (this.permission() !== 'granted') return;
    const opts: NotificationOptions & Record<string, unknown> = {
      body,
      tag: o.tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge.png',
      data: { url: o.url ?? '' },
      requireInteraction: o.sticky,
      vibrate: [200, 100, 200],
    };
    const reg = await this.reg();
    try {
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
    } catch {}
  }

  async schedule(tag: string, title: string, body: string, ts: number, url = '') {
    if (!this.triggers || this.permission() !== 'granted' || ts < Date.now()) return;
    const reg = await this.reg();
    if (!reg) return;
    await this.cancel(tag);
    try {
      await reg.showNotification(title, {
        body, tag, icon: 'icons/icon-192.png', data: { url },
        showTrigger: new TimestampTrigger!(ts),
      } as NotificationOptions);
    } catch {}
  }

  async cancel(tag: string) {
    const reg = await this.reg();
    if (!reg) return;
    try {
      const list = await reg.getNotifications({ tag, includeTriggered: true } as GetNotificationOptions);
      list.forEach((n) => n.close());
    } catch {}
  }
}
