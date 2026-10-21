import { Injectable, inject } from '@angular/core';
import { Data, INBOX } from './data.service';
import { MediaService } from './media.service';
import { Repeat, Task } from './models';
import { SettingsService } from './settings.service';
import { addDays, dateKey, downloadBlob, timeStr, todayKey, uid } from './util';

const RRULE: Partial<Record<Repeat, string>> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function fold(line: string): string {
  const out: string[] = [];
  while (line.length > 74) {
    out.push(line.slice(0, 74));
    line = ' ' + line.slice(74);
  }
  out.push(line);
  return out.join('\r\n');
}

const icsDate = (key: string) => key.replace(/-/g, '');
const icsDateTime = (key: string, time: string) => `${icsDate(key)}T${time.replace(':', '')}00`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

export function toICS(tasks: Task[]): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ritm//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Ритм'];
  for (const t of tasks) {
    if (!t.due) continue;
    L.push('BEGIN:VEVENT', `UID:${t.id}@ritm`, `DTSTAMP:${stamp()}`, fold(`SUMMARY:${esc(t.title)}`));
    if (t.time) {
      const [h, m] = t.time.split(':').map(Number);
      const end = new Date(2000, 0, 1, h, m + 30);
      const endKey = end.getDate() > 1 ? addDays(t.due, 1) : t.due;
      L.push(`DTSTART:${icsDateTime(t.due, t.time)}`, `DTEND:${icsDateTime(endKey, timeStr(end))}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${icsDate(t.due)}`, `DTEND;VALUE=DATE:${icsDate(addDays(t.due, 1))}`);
    }
    const notes = [t.notes, ...t.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`)].filter(Boolean).join('\n');
    if (notes) L.push(fold(`DESCRIPTION:${esc(notes)}`));
    if (t.tags.length) L.push(fold(`CATEGORIES:${t.tags.map(esc).join(',')}`));
    const rr = RRULE[t.repeat];
    if (rr) L.push(`RRULE:${rr}`);
    if (t.done) L.push('STATUS:CANCELLED');
    if (t.remind != null) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(t.title)}`), `TRIGGER:-PT${t.remind}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

interface IcsEvent {
  summary: string;
  description?: string;
  due?: string;
  time?: string;
  repeat: Repeat;
  uid?: string;
}

export function parseICS(text: string): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: IcsEvent | null = null;
  let inAlarm = false;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT' || raw === 'BEGIN:VTODO') cur = { summary: '', repeat: 'none' };
    else if (raw === 'BEGIN:VALARM') inAlarm = true;
    else if (raw === 'END:VALARM') inAlarm = false;
    else if ((raw === 'END:VEVENT' || raw === 'END:VTODO') && cur) {
      if (cur.summary) out.push(cur);
      cur = null;
    } else if (cur && !inAlarm) {
      const i = raw.indexOf(':');
      if (i < 0) continue;
      const [name, ...params] = raw.slice(0, i).split(';');
      const val = raw.slice(i + 1);
      switch (name.toUpperCase()) {
        case 'SUMMARY':
          cur.summary = unesc(val);
          break;
        case 'DESCRIPTION':
          cur.description = unesc(val);
          break;
        case 'UID':
          cur.uid = val;
          break;
        case 'DTSTART':
        case 'DUE': {
          if (cur.due && name.toUpperCase() === 'DUE') break;
          const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
          if (!m) break;
          if (!m[4] || params.some((p) => p.toUpperCase() === 'VALUE=DATE')) {
            cur.due = `${m[1]}-${m[2]}-${m[3]}`;
          } else {
            const d = m[7]
              ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
              : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
            cur.due = dateKey(d);
            cur.time = timeStr(d);
          }
          break;
        }
        case 'RRULE': {
          const f = /FREQ=(\w+)/.exec(val)?.[1];
          if (f === 'DAILY') cur.repeat = 'daily';
          else if (f === 'WEEKLY') cur.repeat = /BYDAY=MO,TU,WE,TH,FR(;|$)/.test(val) ? 'weekdays' : 'weekly';
          else if (f === 'MONTHLY') cur.repeat = 'monthly';
          else if (f === 'YEARLY') cur.repeat = 'yearly';
          break;
        }
      }
    }
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class IoService {
  private data = inject(Data);
  private media = inject(MediaService);
  private settings = inject(SettingsService);

  exportICS(tasks: Task[], name = `ritm-${todayKey()}.ics`) {
    downloadBlob(new Blob([toICS(tasks)], { type: 'text/calendar;charset=utf-8' }), name);
  }

  /** On phones, sharing an .ics opens the system calendar app. */
  async shareICS(t: Task) {
    const file = new File([toICS([t])], `${t.title.slice(0, 40) || 'task'}.ics`, { type: 'text/calendar' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t.title });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    downloadBlob(file, file.name);
  }

  async importICS(text: string): Promise<number> {
    const events = parseICS(text);
    const existing = new Set(this.data.tasks.items().map((t) => t.id));
    let n = 0;
    for (const e of events) {
      const id = e.uid?.endsWith('@ritm') ? e.uid.slice(0, -5) : uid();
      if (existing.has(id)) continue;
      await this.data.saveTask(
        this.data.newTask({ id, title: e.summary, notes: e.description ?? '', due: e.due, time: e.time, repeat: e.repeat, listId: INBOX }),
      );
      n++;
    }
    return n;
  }

  async backup() {
    const media = await Promise.all(
      (await this.media.allRecords()).map(async (r) => ({ id: r.id, mime: r.blob.type, data: await blobToBase64(r.blob) })),
    );
    const payload: Record<string, unknown> = {
      app: 'ritm',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings.s(),
      media,
    };
    for (const c of this.data.all) payload[c.store] = c.items();
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    downloadBlob(blob, `ritm-backup-${todayKey()}.json`);
  }

  async restore(file: File) {
    const json = JSON.parse(await file.text());
    if (json.app !== 'ritm') throw new Error('Это не резервная копия Ритма');
    for (const c of this.data.all) await c.replaceAll(json[c.store] ?? []);
    const media = (json.media ?? []) as { id: string; mime: string; data: string }[];
    await this.media.restore(media.map((m) => ({ id: m.id, blob: base64ToBlob(m.data, m.mime) })));
    if (json.settings) this.settings.replace(json.settings);
  }

  async wipe() {
    for (const c of this.data.all) await c.replaceAll([]);
    await this.media.restore([]);
    localStorage.clear();
  }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
