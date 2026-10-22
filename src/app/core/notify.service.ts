import { Injectable, signal } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { CHANNEL_REMINDERS, isNative, nid } from './platform';

declare const TimestampTrigger: { new (ts: number): unknown } | undefined;

/** Notifications: Web Notifications in the browser, system notifications in the Android app. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  readonly native = isNative;
  readonly supported = isNative || typeof Notification !== 'undefined';
  readonly permission = signal<NotificationPermission>(
    !isNative && typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  /** Can notifications be delivered while the app is closed? */
  readonly triggers =
    isNative ||
    (typeof Notification !== 'undefined' && 'showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined');

  constructor() {
    if (isNative) this.refresh();
  }

  async refresh() {
    if (!isNative) return;
    const p = await LocalNotifications.checkPermissions();
    this.permission.set(p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default');
  }

  async request(): Promise<boolean> {
    if (isNative) {
      const p = await LocalNotifications.requestPermissions();
      this.permission.set(p.display === 'granted' ? 'granted' : 'denied');
      return p.display === 'granted';
    }
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
    if (isNative) {
      await LocalNotifications.schedule({
        notifications: [{ id: nid(o.tag ?? title + Date.now()), title, body, channelId: CHANNEL_REMINDERS,
          smallIcon: 'ic_stat_ritm', extra: { url: o.url ?? '' } }],
      }).catch(() => {});
      return;
    }
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

  async schedule(tag: string, title: string, body: string, ts: number, url = '', extra: Record<string, unknown> = {}) {
    if (!this.triggers || this.permission() !== 'granted' || ts < Date.now()) return;
    if (isNative) {
      await LocalNotifications.schedule({
        notifications: [{ id: nid(tag), title, body, channelId: CHANNEL_REMINDERS, smallIcon: 'ic_stat_ritm',
          schedule: { at: new Date(ts), allowWhileIdle: true }, isExactNotification: false, extra: { url, ...extra } }],
      }).catch(() => {});
      return;
    }
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
    if (isNative) {
      await LocalNotifications.cancel({ notifications: [{ id: nid(tag) }] }).catch(() => {});
      return;
    }
    const reg = await this.reg();
    if (!reg) return;
    try {
      const list = await reg.getNotifications({ tag, includeTriggered: true } as GetNotificationOptions);
      list.forEach((n) => n.close());
    } catch {}
  }
}
