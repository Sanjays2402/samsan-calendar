import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CalEvent } from '../types';

const DB_NAME = 'samsan-calendar';
const DB_VERSION = 2;
const EVENTS = 'events';
const META = 'meta';

interface CalDB extends DBSchema {
  events: {
    key: string;
    value: CalEvent;
    indexes: {
      'by-start': number;
      'by-end': number;
    };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown; updatedAt: number };
  };
}

let _db: Promise<IDBPDatabase<CalDB>> | null = null;

function db(): Promise<IDBPDatabase<CalDB>> {
  if (!_db) {
    _db = openDB<CalDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const events = database.createObjectStore(EVENTS, { keyPath: 'id' });
          events.createIndex('by-start', 'start');
        }
        if (oldVersion < 2) {
          if (!database.objectStoreNames.contains(META)) {
            database.createObjectStore(META, { keyPath: 'key' });
          }
          const events = tx.objectStore(EVENTS);
          if (!events.indexNames.contains('by-end')) {
            events.createIndex('by-end', 'end');
          }
        }
      },
    });
  }
  return _db;
}

/** Load all events ordered by start (asc). */
export async function loadAllEvents(): Promise<CalEvent[]> {
  const d = await db();
  return d.getAllFromIndex(EVENTS, 'by-start');
}

/**
 * Load events that overlap [startMs, endMs).
 *
 * Strategy: use the `by-start` index with an upper bound = endMs (events
 * starting at or after `endMs` cannot overlap), then filter for those whose
 * `end` is strictly greater than `startMs`. This keeps the IDB transaction
 * small and uses the index where possible.
 *
 * For a backing of <10k events on a local-only calendar this is fast enough
 * (sub-ms in practice). If the dataset ever grows we can move to a proper
 * R-tree style index, but YAGNI.
 */
export async function loadEventsInRange(
  startMs: number,
  endMs: number,
): Promise<CalEvent[]> {
  if (endMs <= startMs) return [];
  const d = await db();
  // IDBKeyRange.upperBound(endMs, true) → strictly less than endMs.
  const upper = IDBKeyRange.upperBound(endMs, true);
  const candidates = await d.getAllFromIndex(EVENTS, 'by-start', upper);
  return candidates.filter((ev) => ev.end > startMs);
}

export async function putEvent(ev: CalEvent): Promise<void> {
  const d = await db();
  await d.put(EVENTS, ev);
}

export async function putEvents(evs: CalEvent[]): Promise<void> {
  if (evs.length === 0) return;
  const d = await db();
  const tx = d.transaction(EVENTS, 'readwrite');
  for (const ev of evs) {
    await tx.store.put(ev);
  }
  await tx.done;
}

export async function deleteEvent(id: string): Promise<void> {
  const d = await db();
  await d.delete(EVENTS, id);
}

export async function clearAllEvents(): Promise<void> {
  const d = await db();
  await d.clear(EVENTS);
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const d = await db();
  const row = await d.get(META, key);
  return row ? (row.value as T) : null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const d = await db();
  await d.put(META, { key, value, updatedAt: Date.now() });
}

/** Test-only: drop the cached connection so a fresh in-memory DB can be opened. */
export function _resetDbForTests(): void {
  _db = null;
}
