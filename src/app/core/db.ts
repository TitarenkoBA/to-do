import { Injectable, signal } from '@angular/core';

export const STORES = ['tasks', 'lists', 'notes', 'journal', 'habits', 'alarms', 'sessions', 'media', 'kv'] as const;
export type StoreName = (typeof STORES)[number];

/** Minimal promise wrapper over IndexedDB. */
@Injectable({ providedIn: 'root' })
export class Db {
  private dbp?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('ritm', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private async tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  getAll<T>(store: StoreName) {
    return this.tx<T[]>(store, 'readonly', (s) => s.getAll());
  }
  get<T>(store: StoreName, id: string) {
    return this.tx<T | undefined>(store, 'readonly', (s) => s.get(id));
  }
  put<T>(store: StoreName, value: T) {
    return this.tx<void>(store, 'readwrite', (s) => {
      s.put(value);
    });
  }
  putMany<T>(store: StoreName, values: T[]) {
    return this.tx<void>(store, 'readwrite', (s) => {
      for (const v of values) s.put(v);
    });
  }
  delete(store: StoreName, id: string) {
    return this.tx<void>(store, 'readwrite', (s) => {
      s.delete(id);
    });
  }
  clear(store: StoreName) {
    return this.tx<void>(store, 'readwrite', (s) => {
      s.clear();
    });
  }
}

/** A signal-backed, IndexedDB-persisted collection. */
export class Collection<T extends { id: string }> {
  readonly items = signal<T[]>([]);

  constructor(
    private db: Db,
    readonly store: StoreName,
  ) {}

  async load() {
    this.items.set(await this.db.getAll<T>(this.store));
  }

  get(id: string | null | undefined): T | undefined {
    return id ? this.items().find((i) => i.id === id) : undefined;
  }

  upsert(item: T): Promise<void> {
    this.items.update((list) => {
      const i = list.findIndex((x) => x.id === item.id);
      if (i < 0) return [...list, item];
      const copy = list.slice();
      copy[i] = item;
      return copy;
    });
    return this.db.put(this.store, item);
  }

  patch(id: string, patch: Partial<T>): T | undefined {
    const cur = this.get(id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    this.upsert(next);
    return next;
  }

  remove(id: string): Promise<void> {
    this.items.update((list) => list.filter((x) => x.id !== id));
    return this.db.delete(this.store, id);
  }

  async replaceAll(items: T[]) {
    await this.db.clear(this.store);
    await this.db.putMany(this.store, items);
    this.items.set(items);
  }
}
