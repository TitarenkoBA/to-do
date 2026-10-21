import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { Ui } from './ui.service';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

@Injectable({ providedIn: 'root' })
export class Pwa {
  private ui = inject(Ui);
  private deferred: InstallEvent | null = null;
  readonly canInstall = signal(false);
  readonly standalone = signal(
    matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  );
  readonly online = signal(navigator.onLine);
  readonly persisted = signal(false);
  private wakeLock: { release(): Promise<void> } | null = null;
  readonly awake = signal(false);
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  init() {
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as InstallEvent;
      this.canInstall.set(true);
    });
    addEventListener('appinstalled', () => {
      this.canInstall.set(false);
      this.standalone.set(true);
      this.ui.toast('Ритм установлен 🎉');
    });
    addEventListener('online', () => this.online.set(true));
    addEventListener('offline', () => this.online.set(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.awake()) this.keepAwake(true);
    });
    navigator.storage?.persisted?.().then((p) => this.persisted.set(p));

    if ('serviceWorker' in navigator && !isDevMode()) {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const w = reg.installing;
            w?.addEventListener('statechange', () => {
              if (w.state === 'installed' && navigator.serviceWorker.controller) {
                this.ui.toast('Доступна новая версия', {
                  action: 'Обновить',
                  ms: 15000,
                  fn: () => w.postMessage('skipWaiting'),
                });
              }
            });
          });
        })
        .catch((e) => console.warn('SW failed', e));
      // only reload on updates, not when the very first SW takes control
      let reloaded = !navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'navigate' && e.data.url) location.hash = e.data.url.replace(/^#/, '');
      });
    }
  }

  async install() {
    if (!this.deferred) return;
    await this.deferred.prompt();
    await this.deferred.userChoice;
    this.deferred = null;
    this.canInstall.set(false);
  }

  async persist() {
    const p = (await navigator.storage?.persist?.()) ?? false;
    this.persisted.set(p);
    return p;
  }

  async keepAwake(on: boolean) {
    try {
      if (on) {
        const wl = (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock;
        if (!wl) return false;
        this.wakeLock = await wl.request('screen');
        this.awake.set(true);
        return true;
      }
      await this.wakeLock?.release();
      this.wakeLock = null;
      this.awake.set(false);
    } catch {}
    return false;
  }
}
