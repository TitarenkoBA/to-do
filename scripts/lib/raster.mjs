// Tiny dependency-free rasterizer for the Ritm mark + PNG/WAV encoders.
import { deflateSync } from 'node:zlib';

export const C1 = [124, 92, 255]; // #7c5cff
export const C2 = [236, 72, 153]; // #ec4899

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function png(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const clamp = (v) => Math.max(0, Math.min(1, v));

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function roundRectDist(x, y, r) {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Signed distance to the mark (open ring + checkmark) in unit space; `scale` 1 = full-size. */
export function markDist(x, y, scale) {
  const cx = 0.5, cy = 0.5;
  const R = 0.3 * scale, W = 0.07 * scale;
  const d = Math.hypot(x - cx, y - cy);
  const ang = Math.atan2(y - cy, x - cx);
  const gapStart = -Math.PI / 2 + 0.05, gapEnd = -Math.PI / 2 + 0.95;
  let ring = ang > gapStart && ang < gapEnd ? Infinity : Math.abs(d - R) - W / 2;
  for (const a of [gapStart, gapEnd]) ring = Math.min(ring, Math.hypot(x - (cx + R * Math.cos(a)), y - (cy + R * Math.sin(a))) - W / 2);
  const s = scale;
  const p1 = [cx - 0.13 * s, cy], p2 = [cx - 0.03 * s, cy + 0.1 * s], p3 = [cx + 0.15 * s, cy - 0.1 * s];
  const check = Math.min(segDist(x, y, ...p1, ...p2), segDist(x, y, ...p2, ...p3)) - W / 2;
  return Math.min(ring, check);
}

/**
 * @param shape 'rounded' | 'square' | 'circle' | 'none' — background shape (gradient)
 * @param mark  scale of the white mark, 0 = no mark
 * @param mono  white mark on transparent (notification icons)
 * @param bg    solid [r,g,b] canvas color behind everything (splash)
 * @param iconFrac size of the icon relative to the shorter side (splash)
 */
export function render(w, h, { shape = 'rounded', mark = 1, mono = false, bg = null, iconFrac = 1 } = {}) {
  const buf = Buffer.alloc(w * h * 4);
  const side = Math.min(w, h) * iconFrac;
  const ox = (w - side) / 2, oy = (h - side) / 2;
  const aa = 1.2 / side;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      const x = (i + 0.5 - ox) / side, y = (j + 0.5 - oy) / side;
      let r = 0, g = 0, b = 0, a = 0;
      if (bg) [r, g, b, a] = [...bg, 1];
      const m = mark ? clamp(0.5 - markDist(x, y, mark) / aa) : 0;
      if (mono) {
        buf[o] = buf[o + 1] = buf[o + 2] = 255;
        buf[o + 3] = Math.round(m * 255);
        continue;
      }
      let shapeA = 0;
      if (x >= -0.01 && x <= 1.01 && y >= -0.01 && y <= 1.01) {
        if (shape === 'square') shapeA = 1;
        else if (shape === 'rounded') shapeA = clamp(0.5 - roundRectDist(x, y, 0.23) / aa);
        else if (shape === 'circle') shapeA = clamp(0.5 - (Math.hypot(x - 0.5, y - 0.5) - 0.5) / aa);
      }
      if (shapeA > 0) {
        const t = clamp((x + y) / 2);
        let gr = C1[0] + (C2[0] - C1[0]) * t, gg = C1[1] + (C2[1] - C1[1]) * t, gb = C1[2] + (C2[2] - C1[2]) * t;
        const hl = clamp(1 - Math.hypot(x - 0.25, y - 0.15) / 0.7) * 0.18;
        gr += (255 - gr) * hl; gg += (255 - gg) * hl; gb += (255 - gb) * hl;
        r = r * (1 - shapeA) + gr * shapeA; g = g * (1 - shapeA) + gg * shapeA; b = b * (1 - shapeA) + gb * shapeA;
        a = Math.max(a, shapeA);
      }
      if (m > 0) {
        r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m;
        a = Math.max(a, m);
      }
      buf[o] = Math.round(r); buf[o + 1] = Math.round(g); buf[o + 2] = Math.round(b); buf[o + 3] = Math.round(a * 255);
    }
  }
  return png(w, h, buf);
}

/** 16-bit mono PCM WAV */
export function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
