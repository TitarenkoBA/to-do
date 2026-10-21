// Generates app icons (PNG + SVG) with zero dependencies: `npm run icons`
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const C1 = [124, 92, 255]; // #7c5cff
const C2 = [236, 72, 153]; // #ec4899

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
function png(w, h, rgba) {
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
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (v) => Math.max(0, Math.min(1, v));
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function roundRectDist(x, y, r) {
  // unit square [0,1], corner radius r
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Mark: an open ring (progress) + checkmark. Coordinates in unit space. */
function markCoverage(x, y, scale) {
  const cx = 0.5, cy = 0.5;
  const R = 0.3 * scale, W = 0.07 * scale;
  const d = Math.hypot(x - cx, y - cy);
  let ang = Math.atan2(y - cy, x - cx); // -pi..pi, 0 = right
  const gapStart = -Math.PI / 2 + 0.05, gapEnd = -Math.PI / 2 + 0.95; // gap at top-right
  const inGap = ang > gapStart && ang < gapEnd;
  let ring = inGap ? Infinity : Math.abs(d - R) - W / 2;
  // round caps
  for (const a of [gapStart, gapEnd]) {
    ring = Math.min(ring, Math.hypot(x - (cx + R * Math.cos(a)), y - (cy + R * Math.sin(a))) - W / 2);
  }
  const s = scale;
  const p1 = [cx - 0.13 * s, cy + 0.0 * s], p2 = [cx - 0.03 * s, cy + 0.1 * s], p3 = [cx + 0.15 * s, cy - 0.1 * s];
  const check = Math.min(segDist(x, y, ...p1, ...p2), segDist(x, y, ...p2, ...p3)) - W / 2;
  return Math.min(ring, check);
}

function render(size, { maskable = false, mono = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const aa = 1.2 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size, y = (j + 0.5) / size;
      const o = (j * size + i) * 4;
      if (mono) {
        const a = clamp(0.5 - markCoverage(x, y, 1.25) / aa);
        buf[o] = buf[o + 1] = buf[o + 2] = 255;
        buf[o + 3] = Math.round(a * 255);
        continue;
      }
      const bgA = maskable ? 1 : clamp(0.5 - roundRectDist(x, y, 0.23) / aa);
      const t = clamp((x + y) / 2);
      let r = C1[0] + (C2[0] - C1[0]) * t, g = C1[1] + (C2[1] - C1[1]) * t, b = C1[2] + (C2[2] - C1[2]) * t;
      // soft highlight
      const hl = clamp(1 - Math.hypot(x - 0.25, y - 0.15) / 0.7) * 0.18;
      r += (255 - r) * hl; g += (255 - g) * hl; b += (255 - b) * hl;
      const m = clamp(0.5 - markCoverage(x, y, maskable ? 0.78 : 1) / aa);
      buf[o] = Math.round(r + (255 - r) * m);
      buf[o + 1] = Math.round(g + (255 - g) * m);
      buf[o + 2] = Math.round(b + (255 - b) * m);
      buf[o + 3] = Math.round(bgA * 255);
    }
  }
  return png(size, size, buf);
}

const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180, { maskable: true }),
  'badge.png': render(96, { mono: true }),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, OUT), data);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
  <rect width="100" height="100" rx="23" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${50 + 30 * Math.cos(-Math.PI / 2 + 0.95)} ${50 + 30 * Math.sin(-Math.PI / 2 + 0.95)} A30 30 0 1 1 ${(50 + 30 * Math.cos(-Math.PI / 2 + 0.05)).toFixed(2)} ${(50 + 30 * Math.sin(-Math.PI / 2 + 0.05)).toFixed(2)}"/>
    <path d="M37 50 47 60 65 40"/>
  </g>
</svg>
`;
writeFileSync(new URL('icon.svg', OUT), svg);
console.log('icons written to public/icons/');
