import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CalEvent } from '../types';

const DB_NAME = 'samsan-calendar';
const DB_VERSION = 1;
const STORE = 'events';

interface CalDB extends DBSchema {
  events: {
    key: string;
    value: CalEvent;
    indexes: { 'by-start': number };
  };
}

let _db: Promise<IDBPDatabase<CalDB>> | null = null;

function db(): Promise<IDBPDatabase<CalDB>> {
  if (!_db) {
    _db = openDB<CalDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by-start', 'start');
      },
    });
  }
  return _db;
}

export async function loadAllEvents(): Promise<CalEvent[]> {
  const d = await db();
  const all = await d.getAllFromIndex(STORE, 'by-start');
  return all;
}

export async function putEvent(ev: CalEvent): Promise<void> {
  const d = await db();
  await d.put(STORE, ev);
}

export async function deleteEvent(id: string): Promise<void> {
  const d = await db();
  await d.delete(STORE, id);
}

export async function clearAllEvents(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}
