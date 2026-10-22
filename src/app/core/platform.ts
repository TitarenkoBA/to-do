import { Capacitor } from '@capacitor/core';

/** Running inside the Android (Capacitor) app rather than a browser. */
export const isNative = Capacitor.isNativePlatform();

/** Where the PWA, `ritm.apk` and `version.json` are published (GitHub Pages). */
export const SITE_URL = 'https://titarenkoba.github.io/to-do/';

export const isAndroidBrowser = !isNative && /android/i.test(navigator.userAgent);

/** Notification channels (Android). Channel sound can't change after creation — bump the id instead. */
export const CHANNEL_REMINDERS = 'ritm-reminders-1';
export const CHANNEL_ALARMS = 'ritm-alarms-1';

/** Stable positive 31-bit id for a native notification key. */
export function nid(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}
