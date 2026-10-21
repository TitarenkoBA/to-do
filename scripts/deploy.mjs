// One-command deploy to GitHub Pages:
//   npm run deploy                                   — uses the `origin` remote
//   npm run deploy -- https://github.com/you/ritm.git — first time: sets `origin`, then deploys
// Builds the app and force-pushes dist/ to the `gh-pages` branch.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(root, 'dist', 'to-do', 'browser');
const BRANCH = 'gh-pages';

const git = (args, cwd = root, quiet = false) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'] }).trim();
const tryGit = (args, cwd) => {
  try {
    return git(args, cwd, true);
  } catch {
    return '';
  }
};
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

// 1. remote
if (!existsSync(join(root, '.git'))) {
  git(['init', '-b', 'main']);
  console.log('• создан git-репозиторий');
}
const arg = process.argv.slice(2).find((a) => /github\.com|^git@/.test(a));
if (arg) {
  if (tryGit(['remote', 'get-url', 'origin'])) git(['remote', 'set-url', 'origin', arg]);
  else git(['remote', 'add', 'origin', arg]);
}
const remote = tryGit(['remote', 'get-url', 'origin']);
if (!remote) {
  fail(
    'Не найден GitHub-репозиторий.\n' +
      '  1) Создай пустой репозиторий на https://github.com/new\n' +
      '  2) Запусти: npm run deploy -- https://github.com/<логин>/<репозиторий>.git',
  );
}

// 2. build
if (!process.argv.includes('--no-build')) {
  console.log('• сборка…');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}
if (!existsSync(join(DIST, 'index.html'))) fail('Сборка не найдена в dist/to-do/browser');

// 3. publish dist → gh-pages (fresh orphan commit)
const tmp = mkdtempSync(join(tmpdir(), 'ritm-deploy-'));
try {
  cpSync(DIST, tmp, { recursive: true });
  const name = tryGit(['config', 'user.name']) || 'Ritm Deploy';
  const email = tryGit(['config', 'user.email']) || 'deploy@ritm.local';
  git(['init', '-b', BRANCH], tmp, true);
  git(['add', '-A'], tmp);
  git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${new Date().toISOString()}`], tmp);
  console.log(`• публикация в ${remote} (${BRANCH})…`);
  execFileSync('git', ['push', '--force', remote, `${BRANCH}:${BRANCH}`], { cwd: tmp, stdio: 'inherit' });
} catch (e) {
  fail('Не удалось опубликовать: ' + (e.message || e));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 4. URL
const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
if (m) {
  const [, user, repo] = m;
  const url = repo.toLowerCase() === `${user.toLowerCase()}.github.io` ? `https://${user}.github.io/` : `https://${user}.github.io/${repo}/`;
  console.log(`\n✔ Готово! Через минуту приложение будет здесь:\n  ${url}\n`);
  console.log(`  Если страница 404 — включи Pages: https://github.com/${user}/${repo}/settings/pages → Branch: ${BRANCH} / (root)\n`);
} else console.log('\n✔ Опубликовано в ветку gh-pages\n');
