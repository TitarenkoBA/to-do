import { Injectable, signal } from '@angular/core';

export const SOUNDS = [
  { id: 'sunrise', name: 'Рассвет' },
  { id: 'chime', name: 'Колокольчик' },
  { id: 'marimba', name: 'Маримба' },
  { id: 'birds', name: 'Птицы' },
  { id: 'digital', name: 'Классика' },
] as const;

export const AMBIENT = [
  { id: 'rain', name: 'Дождь', emoji: '🌧️' },
  { id: 'ocean', name: 'Океан', emoji: '🌊' },
  { id: 'brown', name: 'Бурый шум', emoji: '🟤' },
  { id: 'pink', name: 'Розовый шум', emoji: '🌸' },
  { id: 'white', name: 'Белый шум', emoji: '⚪' },
] as const;

type Wave = OscillatorType;

/** Every sound is synthesized with WebAudio — no files, works fully offline. */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx?: AudioContext;
  private ringTimer?: ReturnType<typeof setInterval>;
  private ringGain?: GainNode;
  private ambientNodes: AudioNode[] = [];
  private ambientGain?: GainNode;
  readonly ambient = signal<string | null>(null);
  readonly ambientVolume = signal(0.5);

  ac(): AudioContext {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Call from a user gesture so later alarms are allowed to play. */
  unlock() {
    try {
      this.ac();
    } catch {}
  }

  private note(dest: AudioNode, f: number, t: number, dur: number, type: Wave = 'sine', vol = 0.3, f2?: number, attack = 0.008) {
    const ctx = this.ac();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Schedules one pattern, returns its length in seconds. */
  private pattern(name: string, dest: AudioNode): number {
    const t = this.ac().currentTime + 0.02;
    switch (name) {
      case 'done':
        this.note(dest, 880, t, 0.18, 'sine', 0.25);
        this.note(dest, 1318.5, t + 0.07, 0.3, 'sine', 0.22);
        return 0.4;
      case 'digital':
        for (let r = 0; r < 2; r++)
          for (let i = 0; i < 4; i++) this.note(dest, 2048, t + r * 0.5 + i * 0.09, 0.06, 'square', 0.12, undefined, 0.002);
        return 1.3;
      case 'marimba': {
        const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1318.5];
        seq.forEach((f, i) => {
          this.note(dest, f, t + i * 0.16, 0.5, 'sine', 0.35);
          this.note(dest, f * 4, t + i * 0.16, 0.12, 'sine', 0.05);
        });
        return 1.6;
      }
      case 'birds':
        for (let i = 0; i < 6; i++) {
          const s = t + i * 0.14 + (i > 2 ? 0.35 : 0);
          const base = 2600 + Math.random() * 900;
          this.note(dest, base, s, 0.09, 'sine', 0.18, base * 1.5, 0.004);
        }
        return 1.8;
      case 'chime': {
        [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
          this.note(dest, f, t + i * 0.18, 1.8, 'sine', 0.25);
          this.note(dest, f * 2.76, t + i * 0.18, 0.6, 'sine', 0.05);
        });
        return 2.4;
      }
      case 'sunrise':
      default: {
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.note(dest, f, t + i * 0.28, 1.6, 'triangle', 0.22, undefined, 0.05);
          this.note(dest, f / 2, t + i * 0.28, 1.6, 'sine', 0.12, undefined, 0.05);
        });
        return 2.8;
      }
    }
  }

  play(name: string, volume = 0.9) {
    try {
      const ctx = this.ac();
      const g = ctx.createGain();
      g.gain.value = volume;
      g.connect(ctx.destination);
      const len = this.pattern(name, g);
      setTimeout(() => g.disconnect(), (len + 2) * 1000);
    } catch {}
  }

  /** Loops a sound with gradually rising volume until stopRing(). */
  ring(name: string) {
    this.stopRing();
    try {
      const ctx = this.ac();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 40);
      g.connect(ctx.destination);
      this.ringGain = g;
      const loop = () => this.pattern(name, g);
      const len = loop();
      this.ringTimer = setInterval(loop, (len + 0.6) * 1000);
    } catch {}
  }

  stopRing() {
    clearInterval(this.ringTimer);
    this.ringTimer = undefined;
    this.ringGain?.disconnect();
    this.ringGain = undefined;
  }

  // ---------- ambient noise ----------

  private noiseBuffer(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ac();
    const len = ctx.sampleRate * 6;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.35;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
      }
      // crossfade the loop seam
      const fade = 2048;
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[len - fade + i] * (1 - k);
      }
    }
    return buf;
  }

  setAmbient(kind: string | null) {
    this.ambientNodes.forEach((n) => {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {}
      n.disconnect();
    });
    this.ambientNodes = [];
    this.ambient.set(kind);
    if (!kind) return;
    const ctx = this.ac();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(this.ambientVolume(), ctx.currentTime + 1.5);
    master.connect(ctx.destination);
    this.ambientGain = master;

    const src = ctx.createBufferSource();
    src.loop = true;
    let out: AudioNode = src;
    const nodes: AudioNode[] = [src, master];
    if (kind === 'rain') {
      src.buffer = this.noiseBuffer('pink');
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      out.connect(hp).connect(lp);
      out = lp;
      nodes.push(hp, lp);
    } else if (kind === 'ocean') {
      src.buffer = this.noiseBuffer('brown');
      const wave = ctx.createGain();
      wave.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(wave.gain);
      lfo.start();
      out.connect(wave);
      out = wave;
      nodes.push(wave, lfo, depth);
    } else {
      src.buffer = this.noiseBuffer(kind as 'white' | 'pink' | 'brown');
    }
    out.connect(master);
    src.start();
    this.ambientNodes = nodes;
  }

  setAmbientVolume(v: number) {
    this.ambientVolume.set(v);
    if (this.ambientGain && this.ctx) this.ambientGain.gain.setTargetAtTime(Math.max(v, 0.0001), this.ctx.currentTime, 0.1);
  }
}
