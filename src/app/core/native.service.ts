import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Data } from './data.service';
import { planNotifications } from './native-plan';
import { Notifier } from './notify.service';
import { CHANNEL_ALARMS, CHANNEL_REMINDERS, SITE_URL, isAndroidBrowser, isNative, nid } from './platform';
import { Scheduler } from './scheduler.service';
import { SettingsService } from './settings.service';
import { TaskActions } from './task-actions.service';
import { Ui } from './ui.service';
import { fmtBytes } from './util';

export interface ApkInfo {
  versionName: string;
  versionCode: number;
  size: number;
  builtAt: string;
}

const PLAN_KEY = 'ritm.native.plan';

/**
 * Android app glue: system notifications that fire while the app is closed,
 * notification actions, hardware Back button, status bar, APK download/update info.
 * In the browser only the APK info part is active.
 */
@Injectable({ providedIn: 'root' })
export class NativeService {
  private data = inject(Data);
  private ui = inject(Ui);
  private router = inject(Router);
  private settings = inject(SettingsService);
  private notifier = inject(Notifier);
  private sched = inject(Scheduler);
  private actions = inject(TaskActions);

  readonly native = isNative;
  readonly androidBrowser = isAndroidBrowser;
  /** exact alarms allowed (Android 12+) */
  readonly exact = signal<boolean | null>(null);
  readonly installed = signal<{ version: string; build: number } | null>(null);
  readonly apk = signal<ApkInfo | null>(null);
  readonly apkUrl = isNative ? SITE_URL + 'ritm.apk' : 'ritm.apk';
  readonly apkSize = computed(() => (this.apk() ? fmtBytes(this.apk()!.size) : ''));
  readonly updateAvailable = computed(() => {
    const a = this.apk();
    const i = this.installed();
    return !!a && !!i && a.versionCode > i.build;
  });
  private syncTimer?: ReturnType<typeof setTimeout>;
  private syncing = Promise.resolve();

  init() {
    this.loadApkInfo();
    if (!isNative) return;

    App.getInfo().then((i) => this.installed.set({ version: i.version, build: Number(i.build) || 0 }));
    this.setupNotifications();
    this.setupBackButton();

    effect(() => {
      const dark = this.settings.dark();
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    });

    // Re-plan system notifications whenever anything that rings changes.
    effect(() => {
      this.data.tasks.items();
      this.data.alarms.items();
      this.data.habits.items();
      this.data.today();
      this.notifier.permission();
      untracked(() => this.queueSync());
    });

    App.addListener('resume', () => {
      this.notifier.refresh();
      this.checkExact();
      this.queueSync();
    });
  }

  private async loadApkInfo() {
    try {
      const res = await fetch((isNative ? SITE_URL : '') + 'version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const info = (await res.json()) as ApkInfo;
      this.apk.set(info);
      if (isNative) {
        setTimeout(() => {
          if (this.updateAvailable())
            this.ui.toast(`Доступна версия ${info.versionName}`, { action: 'Скачать', fn: () => this.download(), ms: 10000 });
        }, 3000);
      }
    } catch {}
  }

  download() {
    // In the app an external URL opens in the system browser, which downloads the APK.
    location.href = this.apkUrl;
  }

  // ---------- notifications ----------

  private async setupNotifications() {
    await LocalNotifications.createChannel({
      id: CHANNEL_REMINDERS, name: 'Напоминания', description: 'Задачи, привычки, помодоро',
      importance: 4, sound: 'ritm_reminder.wav', vibration: true, visibility: 1, lights: true, lightColor: '#7C5CFF',
    }).catch(() => {});
    await LocalNotifications.createChannel({
      id: CHANNEL_ALARMS, name: 'Будильники', description: 'Будильники и таймеры',
      importance: 5, sound: 'ritm_alarm.wav', vibration: true, visibility: 1, lights: true, lightColor: '#7C5CFF',
    }).catch(() => {});
    await LocalNotifications.registerActionTypes({
      types: [
        { id: 'TASK', actions: [{ id: 'done', title: '✓ Выполнено' }, { id: 'snooze', title: 'Через 10 мин' }] },
        { id: 'ALARM', actions: [{ id: 'snooze', title: '💤 Отложить' }, { id: 'stop', title: 'Выключить' }] },
        { id: 'HABIT', actions: [{ id: 'done', title: '✓ Готово' }] },
      ],
    }).catch(() => {});
    LocalNotifications.addListener('localNotificationActionPerformed', (e) =>
      this.onAction(e.actionId, (e.notification.extra ?? {}) as Record<string, string>),
    );
    await this.notifier.refresh();
    await this.checkExact();
    this.queueSync();
  }

  async checkExact() {
    try {
      const r = await LocalNotifications.checkExactNotificationSetting();
      this.exact.set(r.exact_alarm === 'granted');
    } catch {
      this.exact.set(true);
    }
  }

  async requestExact() {
    const r = await LocalNotifications.changeExactNotificationSetting().catch(() => null);
    this.exact.set(r?.exact_alarm === 'granted');
    this.queueSync();
  }

  queueSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => (this.syncing = this.syncing.then(() => this.sync()).catch(() => {})), 600);
  }

  /** Diff the desired plan against what was registered before; only touch what changed. */
  private async sync() {
    if (this.notifier.permission() !== 'granted') return;
    const now = Date.now();
    const plan = planNotifications(
      { tasks: this.data.tasks.items(), alarms: this.data.alarms.items(), habits: this.data.habits.items() }, now,
    );
    let prev: Record<string, string> = {};
    try {
      prev = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}');
    } catch {}
    const next: Record<string, string> = {};
    const changed = [];
    for (const p of plan) {
      const id = nid(p.key);
      const sig = `${p.at}|${p.title}|${p.body}`;
      next[id] = sig;
      if (prev[id] !== sig) changed.push({ id, p });
    }
    // Only cancel still-pending ones: cancelling a delivered notification would also remove it from the tray.
    const stale = Object.entries(prev)
      .filter(([id, sig]) => !(id in next) && Number(sig.split('|')[0]) > now)
      .map(([id]) => ({ id: Number(id) }));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale });
    if (changed.length) {
      const exact = this.exact() !== false;
      await LocalNotifications.schedule({
        notifications: changed.map(({ id, p }) => ({
          id,
          title: p.title,
          body: p.body,
          schedule: { at: new Date(p.at), allowWhileIdle: true },
          channelId: p.kind === 'alarm' ? CHANNEL_ALARMS : CHANNEL_REMINDERS,
          actionTypeId: p.kind.toUpperCase(),
          smallIcon: 'ic_stat_ritm',
          iconColor: '#7C5CFF',
          autoCancel: true,
          foreground: true,
          isExactNotification: exact,
          extra: { kind: p.kind, refId: p.refId, url: p.url, key: p.key },
        })),
      });
    }
    localStorage.setItem(PLAN_KEY, JSON.stringify(next));
  }

  private onAction(action: string, x: Record<string, string>) {
    const go = (url: string) => url && this.router.navigateByUrl(url.replace(/^#/, ''));
    if (x['kind'] === 'task') {
      const t = this.data.tasks.get(x['refId']);
      if (!t) return;
      if (action === 'done') {
        if (!t.done) this.actions.toggle(t);
      } else if (action === 'snooze') {
        this.notifier.schedule(`snz:${t.id}`, `🔔 ${t.title}`, 'Отложено на 10 минут', Date.now() + 10 * 60000, '#/today',
          { kind: 'task', refId: t.id });
        this.ui.toast('Напомню через 10 минут');
      } else {
        go('#/today');
        setTimeout(() => this.ui.openTask(t.id), 300);
      }
    } else if (x['kind'] === 'alarm') {
      const a = this.data.alarms.get(x['refId']);
      if (action === 'snooze' && a) {
        this.data.alarms.patch(a.id, { snoozeUntil: Date.now() + a.snoozeMin * 60000, enabled: true });
        this.ui.toast(`Отложено на ${a.snoozeMin} мин`);
      }
      if (this.sched.ringing()) this.sched.stop();
      if (action !== 'snooze') go('#/alarms');
    } else if (x['kind'] === 'habit') {
      const h = this.data.habits.get(x['refId']);
      if (h && action === 'done') {
        this.data.habits.upsert({ ...h, log: { ...h.log, [this.data.today()]: h.target } });
        this.ui.toast(`${h.emoji} ${h.name} — готово!`);
      } else go('#/habits');
    } else go(x['url'] ?? '');
  }

  // ---------- back button ----------

  private setupBackButton() {
    App.addListener('backButton', ({ canGoBack }) => {
      const ui = this.ui;
      if (this.sched.ringing()) return;
      if (ui.confirmReq()) {
        ui.confirmReq()!.resolve(false);
        ui.confirmReq.set(null);
      } else if (ui.viewer()) ui.viewer.set(null);
      else if (ui.search()) ui.search.set(false);
      else if (canGoBack) history.back();
      else if (!location.hash.startsWith('#/today')) this.router.navigateByUrl('/today', { replaceUrl: true });
      else App.minimizeApp();
    });
  }
}
