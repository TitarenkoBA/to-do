// Generates web app icons (PNG + SVG) with zero dependencies: `npm run icons`
import { mkdirSync, writeFileSync } from 'node:fs';
import { render } from './lib/raster.mjs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const files = {
  'icon-192.png': render(192, 192),
  'icon-512.png': render(512, 512),
  'maskable-512.png': render(512, 512, { shape: 'square', mark: 0.78 }),
  'apple-touch-icon.png': render(180, 180, { shape: 'square', mark: 0.78 }),
  'badge.png': render(96, 96, { mono: true, mark: 1.25 }),
};
for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, OUT), data);

const a = (t) => -Math.PI / 2 + t;
const pt = (t) => `${(50 + 30 * Math.cos(a(t))).toFixed(2)} ${(50 + 30 * Math.sin(a(t))).toFixed(2)}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>
  <rect width="100" height="100" rx="23" fill="url(#g)"/>
  <g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${pt(0.95)} A30 30 0 1 1 ${pt(0.05)}"/>
    <path d="M37 50 47 60 65 40"/>
  </g>
</svg>
`;
writeFileSync(new URL('icon.svg', OUT), svg);
console.log('icons written to public/icons/');
