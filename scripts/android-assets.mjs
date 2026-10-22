// Generates Android resources: launcher icons, notification icon, splash, notification sounds.
// `npm run android:assets` — results are committed under android/app/src/main/res.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, wav } from './lib/raster.mjs';

const RES = join(fileURLToPath(new URL('..', import.meta.url)), 'android', 'app', 'src', 'main', 'res');
if (!existsSync(RES)) {
  console.error('android/ not found — run `npx cap add android` first');
  process.exit(1);
}
const put = (rel, data) => {
  const p = join(RES, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, data);
};

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const s = Math.round(48 * k);
  put(`mipmap-${d}/ic_launcher.png`, render(s, s));
  put(`mipmap-${d}/ic_launcher_round.png`, render(s, s, { shape: 'circle', mark: 0.85 }));
  // adaptive icon foreground: 108dp canvas, mark inside the 66dp safe zone
  const f = Math.round(108 * k);
  put(`mipmap-${d}/ic_launcher_foreground.png`, render(f, f, { shape: 'none', mark: 0.62 }));
  // status-bar icon: white silhouette, 24dp
  const n = Math.round(24 * k);
  put(`drawable-${d}/ic_stat_ritm.png`, render(n, n, { mono: true, mark: 1.3 }));
}

put('drawable/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="315" android:startColor="#7C5CFF" android:endColor="#EC4899" />
</shape>
`);
put('mipmap-anydpi-v26/ic_launcher.xml', `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`);
put('mipmap-anydpi-v26/ic_launcher_round.xml', readFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml')));

// Splash: replace every template splash.png keeping its size
const BG = [14, 14, 19];
for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const p = join(RES, dir, 'splash.png');
  if (!existsSync(p)) continue;
  const head = readFileSync(p).subarray(16, 24);
  const w = head.readUInt32BE(0), h = head.readUInt32BE(4);
  writeFileSync(p, render(w, h, { bg: BG, iconFrac: 0.26 }));
}

// ---------- sounds (same melodies as the in-app WebAudio synth) ----------
const RATE = 22050;
function synth(seconds, schedule) {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const note = (f, t0, dur, type = 'sine', vol = 0.3, attack = 0.008, gain = 1) => {
    const start = Math.floor(t0 * RATE), n = Math.floor(dur * RATE);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const tt = i / RATE;
      const env = tt < attack ? vol * (0.0001 / vol) ** (1 - tt / attack) : vol * (0.0001 / vol) ** ((tt - attack) / (dur - attack));
      const ph = (f * tt) % 1;
      const wave = type === 'triangle' ? 1 - 4 * Math.abs(ph - 0.5) : Math.sin(2 * Math.PI * ph);
      out[start + i] += wave * env * gain;
    }
  };
  schedule(note);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.95) for (let i = 0; i < out.length; i++) out[i] *= 0.95 / peak;
  return wav(out, RATE);
}

const sunrise = (note, t, gain) =>
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    note(f, t + i * 0.28, 1.6, 'triangle', 0.22, 0.05, gain);
    note(f / 2, t + i * 0.28, 1.6, 'sine', 0.12, 0.05, gain);
  });
const chime = (note, t, gain = 1) =>
  [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
    note(f, t + i * 0.18, 1.8, 'sine', 0.25, 0.008, gain);
    note(f * 2.76, t + i * 0.18, 0.6, 'sine', 0.05, 0.008, gain);
  });

put('raw/ritm_alarm.wav', synth(30, (note) => {
  for (let k = 0; k * 3.4 < 28; k++) sunrise(note, 0.05 + k * 3.4, 1.4 + Math.min(1, k / 6) * 1.4);
}));
put('raw/ritm_reminder.wav', synth(2.6, (note) => chime(note, 0.02, 1.6)));

console.log('android resources written to android/app/src/main/res');
