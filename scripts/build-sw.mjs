// Post-build: writes sw.js with a precache list of every built file, plus GitHub Pages helpers.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(root, 'dist', 'to-do', 'browser');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const skip = new Set(['sw.js', '404.html', '.nojekyll', '3rdpartylicenses.txt', 'favicon.ico', 'ritm.apk', 'version.json']);
const files = walk(DIST)
  .map((p) => relative(DIST, p).split(sep).join('/'))
  .filter((f) => !skip.has(f) && !f.endsWith('.map'))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(DIST, f)));
const version = hash.digest('hex').slice(0, 12);

const assets = ['./', ...files];
const sw = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8')
  .replace('__VERSION__', version)
  .replace('__ASSETS__', JSON.stringify(assets, null, 2));
writeFileSync(join(DIST, 'sw.js'), sw);

// GitHub Pages: skip Jekyll processing, and serve the app for unknown paths.
writeFileSync(join(DIST, '.nojekyll'), '');
copyFileSync(join(DIST, 'index.html'), join(DIST, '404.html'));

console.log(`✔ sw.js: ${assets.length} files precached, version ${version}`);
