import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Data } from '../core/data.service';
import { IoService } from '../core/io.service';
import { NativeService } from '../core/native.service';
import { Notifier } from '../core/notify.service';
import { Pwa } from '../core/pwa.service';
import { SettingsService } from '../core/settings.service';
import { SOUNDS, SoundService } from '../core/sound.service';
import { Ui } from '../core/ui.service';
import { PALETTE, fmtBytes, pickFile } from '../core/util';
import { Icon } from '../shared/icon';
import { REMIND_OPTIONS } from '../shared/tasks';
import { PageHeader } from '../shared/ui';

@Component({
  selector: 'app-settings',
  imports: [Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page max-w-3xl">
      <app-page-header title="Настройки" />

      <div class="space-y-6">
        <section class="card space-y-4">
          <h2 class="label">Профиль</h2>
          <input class="input" placeholder="Как тебя зовут?" [value]="s().name" (change)="settings.set('name', $any($event.target).value.trim())" />
        </section>

        <section class="card space-y-4">
          <h2 class="label">Оформление</h2>
          <div class="grid grid-cols-3 gap-2">
            @for (t of themes; track t.id) {
              <button class="chip justify-center py-3" [class.chip-on]="s().theme === t.id" (click)="settings.set('theme', t.id)">
                <app-icon [name]="t.icon" [size]="16" />{{ t.name }}</button>
            }
          </div>
          <div class="flex flex-wrap gap-2.5">
            @for (c of palette; track c) {
              <button class="grid size-9 place-items-center rounded-full text-white ring-offset-2 ring-offset-surface transition active:scale-90" [style.background]="c"
                [class.ring-2]="s().accent === c" [style.--tw-ring-color]="c" (click)="settings.set('accent', c)" [attr.aria-label]="c">
                @if (s().accent === c) { <app-icon name="check" [size]="16" [stroke]="3" /> }
              </button>
            }
          </div>
          <div class="flex items-center gap-3">
            <span class="flex-1">Неделя начинается с</span>
            <div class="flex rounded-xl bg-surface-2 p-1 text-sm font-semibold">
              <button class="rounded-lg px-3 py-1.5" [class.bg-surface]="s().weekStart === 1" (click)="settings.set('weekStart', 1)">Пн</button>
              <button class="rounded-lg px-3 py-1.5" [class.bg-surface]="s().weekStart === 0" (click)="settings.set('weekStart', 0)">Вс</button>
            </div>
          </div>
        </section>

        <section class="card space-y-4">
          <h2 class="label">Напоминания</h2>
          <div class="flex items-center gap-3">
            <app-icon name="bell" class="text-accent" />
            <span class="flex-1">Уведомления: <b>{{ permLabel() }}</b></span>
            @if (notifier.permission() === 'default') { <button class="btn btn-primary !py-2" (click)="notifier.request()">Разрешить</button> }
            @if (notifier.permission() === 'granted') { <button class="btn btn-soft !py-2" (click)="testNotify()">Тест</button> }
          </div>
          @if (notifier.permission() === 'denied') {
            <p class="text-sm text-muted">Уведомления заблокированы — включи их в настройках сайта в браузере.</p>
          }
          <label class="field">
            <span class="text-sm text-muted">По умолчанию</span>
            <select class="flex-1 bg-transparent text-right outline-none" (change)="setRemind($any($event.target).value)">
              @for (o of remindOpts; track o[1]) { <option [value]="o[0] ?? ''" [selected]="s().defaultRemind === o[0]">{{ o[1] }}</option> }
            </select>
          </label>
          <div class="flex flex-wrap gap-2" [class.hidden]="native.native">
            @for (x of sounds; track x.id) {
              <button class="chip" [class.chip-on]="s().reminderSound === x.id" (click)="settings.set('reminderSound', x.id); sound.play(x.id)">
                <app-icon name="volume" [size]="14" />{{ x.name }}</button>
            }
          </div>
          <label class="flex items-center gap-3"><span class="flex-1">Вибрация</span>
            <input type="checkbox" class="switch" [checked]="s().vibrate" (change)="settings.set('vibrate', $any($event.target).checked)" /></label>
          @if (native.native) {
            <p class="text-sm text-ok">✓ Напоминания ставятся в систему Android и придут даже при закрытом приложении.</p>
          } @else if (notifier.triggers) {
            <p class="text-sm text-ok">✓ Браузер поддерживает отложенные уведомления — напоминания придут даже при закрытом приложении.</p>
          } @else {
            <p class="text-sm text-muted">Напоминания срабатывают, пока Ритм открыт или свёрнут. Для системных напоминаний экспортируй задачи в календарь (.ics).</p>
          }
        </section>

        @if (native.native) {
          <section class="card space-y-4">
            <h2 class="label">Android</h2>
            <div class="flex items-center gap-3">
              <span class="text-xl">🤖</span>
              <span class="flex-1">Версия <b>{{ native.installed()?.version ?? '…' }}</b></span>
              @if (native.updateAvailable()) {
                <button class="btn btn-primary !py-2" (click)="native.download()">Обновить до {{ native.apk()!.versionName }}</button>
              }
            </div>
            <div class="flex items-center gap-3">
              <app-icon name="alarm" class="text-accent" />
              <span class="flex-1">Точные будильники: <b>{{ native.exact() === false ? 'выключены' : 'включены' }}</b></span>
              @if (native.exact() === false) { <button class="btn btn-soft !py-2" (click)="native.requestExact()">Разрешить</button> }
            </div>
            <p class="text-sm text-muted">
              Напоминания и будильники приходят даже при закрытом приложении. Если на Xiaomi, Huawei, Samsung или OPPO они опаздывают —
              открой «Настройки телефона → Приложения → Ритм → Батарея» и выбери «Без ограничений».
            </p>
          </section>
        } @else if (native.apk(); as a) {
          <section class="card space-y-3">
            <h2 class="label">Android-приложение</h2>
            <p class="text-sm text-muted">В приложении напоминания и будильники срабатывают, даже когда оно закрыто.</p>
            <a class="row-btn" [href]="native.apkUrl" download><app-icon name="download" />Скачать APK
              <span class="ml-auto text-xs text-muted">{{ a.versionName }} · {{ native.apkSize() }}</span></a>
          </section>
        }

        <section class="card space-y-4">
          <h2 class="label">Приложение</h2>
          @if (!native.native) {
            <div class="flex items-center gap-3">
              <app-icon name="phone" class="text-accent" />
              <span class="flex-1">{{ pwa.standalone() ? 'Установлено на устройство' : 'Работает в браузере' }}</span>
              @if (pwa.canInstall()) { <button class="btn btn-primary !py-2" (click)="pwa.install()">Установить</button> }
            </div>
          }
          @if (!native.native && !pwa.standalone() && pwa.isIos) {
            <p class="text-sm text-muted">На iPhone: нажми «Поделиться» → «На экран Домой».</p>
          }
          <div class="flex items-center gap-3">
            <app-icon [name]="pwa.online() ? 'check' : 'wifi_off'" class="text-ok" />
            <span class="flex-1">Работает офлайн — все данные хранятся только на этом устройстве</span>
          </div>
          <div class="flex items-center gap-3" [class.hidden]="native.native">
            <app-icon name="shield" class="text-accent" />
            <span class="flex-1">Защита от очистки браузером: <b>{{ pwa.persisted() ? 'включена' : 'выключена' }}</b></span>
            @if (!pwa.persisted()) { <button class="btn btn-soft !py-2" (click)="persist()">Включить</button> }
          </div>
          @if (usage(); as u) {
            <div>
              <div class="mb-1 flex justify-between text-sm"><span>Занято</span><span class="text-muted">{{ u.used }} из {{ u.quota }}</span></div>
              <div class="h-2 overflow-hidden rounded-full bg-surface-2"><div class="h-full rounded-full bg-accent" [style.width.%]="u.pct"></div></div>
            </div>
          }
        </section>

        <section class="card space-y-3">
          <h2 class="label">Данные</h2>
          <button class="row-btn" (click)="backup()"><app-icon name="download" />Создать резервную копию<span class="ml-auto text-xs text-muted">.json, вместе с медиа</span></button>
          <button class="row-btn" (click)="restore()"><app-icon name="upload" />Восстановить из копии</button>
          <button class="row-btn" (click)="ics()"><app-icon name="calendar" />Экспорт задач в календарь<span class="ml-auto text-xs text-muted">.ics</span></button>
          <button class="row-btn text-danger" (click)="wipe()"><app-icon name="trash" />Удалить все данные</button>
        </section>

        <section class="pb-4 text-center text-sm text-muted">
          <div class="mb-1 text-2xl">🌀</div>
          <b class="text-ink">Ритм</b> · задачи, привычки, дневник, фокус<br />
          <span class="hidden lg:inline">Горячие клавиши: <kbd>N</kbd> — задача, <kbd>Ctrl</kbd>+<kbd>K</kbd> — поиск, <kbd>F</kbd> — фокус</span>
        </section>
      </div>
    </div>
  `,
})
export class SettingsPage {
  protected settings = inject(SettingsService);
  protected notifier = inject(Notifier);
  protected pwa = inject(Pwa);
  protected sound = inject(SoundService);
  protected native = inject(NativeService);
  private io = inject(IoService);
  private data = inject(Data);
  private ui = inject(Ui);
  protected s = this.settings.s;
  protected readonly palette = PALETTE;
  protected readonly sounds = SOUNDS;
  protected readonly remindOpts = REMIND_OPTIONS;
  protected readonly themes = [
    { id: 'system' as const, name: 'Авто', icon: 'monitor' },
    { id: 'light' as const, name: 'Светлая', icon: 'sun' },
    { id: 'dark' as const, name: 'Тёмная', icon: 'moon' },
  ];
  protected readonly usage = signal<{ used: string; quota: string; pct: number } | null>(null);

  constructor() {
    this.refreshUsage();
  }

  private async refreshUsage() {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota) this.usage.set({ used: fmtBytes(e.usage ?? 0), quota: fmtBytes(e.quota), pct: Math.max(1, ((e.usage ?? 0) / e.quota) * 100) });
  }

  permLabel() {
    return { granted: 'разрешены', denied: 'заблокированы', default: 'не настроены' }[this.notifier.permission()];
  }

  setRemind(v: string) {
    this.settings.set('defaultRemind', v === '' ? null : Number(v));
  }

  testNotify() {
    this.notifier.show('🌀 Ритм', 'Уведомления работают!');
  }

  async persist() {
    const ok = await this.pwa.persist();
    this.ui.toast(ok ? 'Данные защищены от автоочистки' : 'Браузер отклонил запрос — установи приложение и попробуй снова');
  }

  async backup() {
    this.ui.toast('Готовлю копию…');
    await this.io.backup();
  }

  async restore() {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    if (!(await this.ui.confirm('Восстановить из копии?', { text: 'Текущие данные будут заменены', ok: 'Восстановить', danger: true }))) return;
    try {
      await this.io.restore(f);
      this.ui.toast('Данные восстановлены ✨');
      this.refreshUsage();
    } catch (e) {
      this.ui.toast((e as Error).message || 'Не удалось прочитать файл');
    }
  }

  ics() {
    const tasks = this.data.tasks.items().filter((t) => t.due && !t.done);
    if (!tasks.length) return this.ui.toast('Нет задач с датой');
    this.io.exportICS(tasks);
  }

  async wipe() {
    if (!(await this.ui.confirm('Удалить всё?', { text: 'Задачи, заметки, дневник, привычки и медиа будут удалены безвозвратно', ok: 'Удалить всё', danger: true }))) return;
    await this.io.wipe();
    location.reload();
  }
}
