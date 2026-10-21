import { Injectable, inject } from '@angular/core';
import { Db } from './db';
import { Attachment, MediaKind } from './models';
import { uid } from './util';

interface MediaRecord {
  id: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class MediaService {
  private db = inject(Db);
  private urls = new Map<string, string>();

  kindOf(mime: string): MediaKind {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'file';
  }

  async add(input: Blob, name?: string, duration?: number): Promise<Attachment> {
    let blob = input;
    const kind = this.kindOf(blob.type);
    if (kind === 'image' && !/gif|svg/.test(blob.type)) blob = await compressImage(blob).catch(() => blob);
    if ((kind === 'video' || kind === 'audio') && duration == null) duration = await probeDuration(blob);
    const att: Attachment = {
      id: uid(), kind, mime: blob.type || 'application/octet-stream', name, size: blob.size,
      duration, createdAt: Date.now(),
    };
    await this.db.put<MediaRecord>('media', { id: att.id, blob });
    return att;
  }

  async blob(id: string): Promise<Blob | null> {
    return (await this.db.get<MediaRecord>('media', id))?.blob ?? null;
  }

  async url(id: string): Promise<string | null> {
    const cached = this.urls.get(id);
    if (cached) return cached;
    const b = await this.blob(id);
    if (!b) return null;
    const u = URL.createObjectURL(b);
    this.urls.set(id, u);
    return u;
  }

  async remove(atts: Attachment[] | undefined) {
    for (const a of atts ?? []) {
      const u = this.urls.get(a.id);
      if (u) URL.revokeObjectURL(u);
      this.urls.delete(a.id);
      await this.db.delete('media', a.id);
    }
  }

  async allRecords(): Promise<MediaRecord[]> {
    return this.db.getAll<MediaRecord>('media');
  }

  async restore(records: MediaRecord[]) {
    await this.db.clear('media');
    await this.db.putMany('media', records);
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
  }

  async share(att: Attachment) {
    const b = await this.blob(att.id);
    if (!b) return false;
    const ext = att.mime.split('/')[1]?.split(';')[0] || 'bin';
    const file = new File([b], att.name || `ritm-${att.id}.${ext}`, { type: att.mime });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {});
      return true;
    }
    return false;
  }
}

async function compressImage(blob: Blob, max = 2048, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.size < 1.5e6) {
    bmp.close();
    return blob;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return out && out.size < blob.size ? out : blob;
}

function probeDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const el = document.createElement(blob.type.startsWith('video') ? 'video' : 'audio');
    const url = URL.createObjectURL(blob);
    const done = (v?: number) => {
      URL.revokeObjectURL(url);
      resolve(v && isFinite(v) ? v : undefined);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done();
    setTimeout(() => done(), 3000);
    el.src = url;
  });
}
