// Builds a signed release APK into apk/ritm.apk (+ apk/version.json): `npm run apk`
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ANDROID = join(root, 'android');
const OUT = join(root, 'apk');
const win = process.platform === 'win32';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: win, ...opts });
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

// ---------- Java 17+ ----------
function javaMajor(home) {
  const bin = join(home, 'bin', win ? 'java.exe' : 'java');
  if (!existsSync(bin)) return 0;
  // `java -version` prints to stderr
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return Number(/version "(\d+)/.exec(r.stderr + r.stdout)?.[1] ?? 0);
}
function findJava() {
  const candidates = [
    process.env.JAVA_HOME,
    win && 'C:/Program Files/Android/Android Studio/jbr',
    process.platform === 'darwin' && '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ].filter(Boolean);
  const home = candidates.find((h) => javaMajor(h) >= 17);
  return home ? { home } : null;
}
const java = findJava();
if (!java) fail('Не найдена Java 17+. Установи Android Studio или JDK 21 и задай JAVA_HOME.');
const env = { ...process.env, JAVA_HOME: java.home };
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
if (!existsSync(sdk)) fail('Не найден Android SDK. Установи Android Studio или задай ANDROID_HOME.');
env.ANDROID_HOME = sdk;

// ---------- signing key (once) ----------
const propsFile = join(ANDROID, 'keystore.properties');
if (!existsSync(propsFile)) {
  const pass = randomBytes(18).toString('base64url');
  const store = 'ritm-release.keystore';
  console.log('• создаю ключ подписи android/' + store);
  execFileSync(join(java.home, 'bin', win ? 'keytool.exe' : 'keytool'), [
    '-genkeypair', '-keystore', join(ANDROID, store), '-alias', 'ritm', '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-storepass', pass, '-keypass', pass, '-dname', 'CN=Ritm, O=Ritm, C=RU',
  ], { stdio: 'ignore' });
  writeFileSync(propsFile, `storeFile=${store}\nstorePassword=${pass}\nkeyAlias=ritm\nkeyPassword=${pass}\n`);
  console.log('  ⚠ Сохрани android/ritm-release.keystore и android/keystore.properties в надёжном месте!');
  console.log('    Без них следующую версию не получится установить поверх текущей.\n');
}

// ---------- build ----------
if (!process.argv.includes('--no-web')) {
  console.log('• сборка веб-части…');
  run('npm', ['run', 'build']);
}
console.log('• cap sync android…');
run('npx', ['cap', 'sync', 'android']);
console.log('• gradle assembleRelease…');
const gradleArgs = 'assembleRelease --console=plain -q';
if (win) {
  execFileSync('cmd.exe', ['/d', '/s', '/c', `""${join(ANDROID, 'gradlew.bat')}" ${gradleArgs}"`], {
    cwd: ANDROID, stdio: 'inherit', env, windowsVerbatimArguments: true,
  });
} else {
  execFileSync('./gradlew', gradleArgs.split(' '), { cwd: ANDROID, stdio: 'inherit', env });
}

const relDir = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');
const meta = JSON.parse(readFileSync(join(relDir, 'output-metadata.json'), 'utf8')).elements[0];
mkdirSync(OUT, { recursive: true });
const apk = join(OUT, 'ritm.apk');
copyFileSync(join(relDir, meta.outputFile), apk);
const info = { versionName: meta.versionName, versionCode: meta.versionCode, size: statSync(apk).size, builtAt: new Date().toISOString() };
writeFileSync(join(OUT, 'version.json'), JSON.stringify(info, null, 2) + '\n');

console.log(`\n✔ apk/ritm.apk — версия ${info.versionName} (${info.versionCode}), ${(info.size / 1048576).toFixed(1)} МБ`);
console.log('  Опубликовать вместе с сайтом: npm run deploy\n');
