/**
 * SAM-59 data-layer smoke test.
 *
 * Verifies the contract owned by this slice (storage + store + seed):
 *
 *   1. hydrate() on a brand-new IDB auto-seeds the demo set and marks seeded
 *   2. hydrate() called twice does NOT re-seed (meta gate works)
 *   3. seedIfEmpty is a no-op when the store already has events,
 *      and acts as a recovery insert when the store is empty
 *   4. CRUD: createEvent → updateEvent → deleteEvent round-trip through IDB
 *   5. Undo / Redo round-trip restores prior state on disk
 *   6. loadEventsInRange returns only events overlapping the window
 *   7. buildSeedEvents is deterministic for a fixed anchor day
 *
 * Run with: pnpm test:data
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  _resetDbForTests,
  clearAllEvents,
  getMeta,
  loadAllEvents,
  loadEventsInRange,
  setMeta,
} from '../src/lib/storage';
import { useStore, _resetHydrateGuardForTests } from '../src/store/calendar';
import { buildSeedEvents } from '../src/lib/seed';
import {
  addDaysMs,
  addMinutesMs,
  endOfDayMs,
  startOfDayMs,
  todayMs,
} from '../src/lib/date';
import { uid } from '../src/lib/uid';
import type { CalEvent } from '../src/types';

/** Reset both IDB and the in-memory zustand store between tests. */
function resetEverything(): void {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  _resetDbForTests();
  _resetHydrateGuardForTests();
  useStore.setState({
    events: {},
    selectedEventId: null,
    draftId: null,
    paletteOpen: false,
    hydrated: false,
    undoStack: [],
    redoStack: [],
    toast: null,
  });
}

test('hydrate() auto-seeds a brand-new IDB and marks the seed.v1 meta', async () => {
  resetEverything();

  await useStore.getState().hydrate();
  const s = useStore.getState();

  assert.equal(s.hydrated, true, 'hydrate must flip the flag');
  const persisted = await loadAllEvents();
  assert.ok(
    persisted.length >= 15,
    `seed should land ≥15 events on disk, got ${persisted.length}`,
  );
  assert.equal(
    Object.keys(s.events).length,
    persisted.length,
    'in-memory store must mirror IDB',
  );

  const seeded = await getMeta<boolean>('seed.v1');
  assert.equal(seeded, true, 'seed.v1 meta key must flip on first seed');

  // The seed covers a full themed week, so the landing week (any anchor day)
  // is guaranteed to be populated.
  const weekEvents = persisted.filter(
    (ev) =>
      ev.start >= addDaysMs(startOfDayMs(todayMs()), -7) &&
      ev.start <= addDaysMs(startOfDayMs(todayMs()), 7),
  );
  assert.ok(
    weekEvents.length >= 10,
    `expected ≥10 events in the seeded week, got ${weekEvents.length}`,
  );
});

test('hydrate() called twice does not re-seed', async () => {
  resetEverything();

  await useStore.getState().hydrate();
  const firstCount = (await loadAllEvents()).length;
  assert.ok(firstCount > 0);

  // Reset only the in-memory store; keep IDB + seed.v1 meta intact.
  // Also clear the hydrate-coalescing guard so the second call actually runs.
  _resetHydrateGuardForTests();
  useStore.setState({ events: {}, hydrated: false });
  await useStore.getState().hydrate();
  const secondCount = (await loadAllEvents()).length;
  assert.equal(secondCount, firstCount, 'second hydrate must not duplicate seed');
  assert.equal(
    Object.keys(useStore.getState().events).length,
    firstCount,
    'store rehydrates the full set from disk',
  );
});

test('concurrent hydrate() calls share work (StrictMode race regression)', async () => {
  resetEverything();

  // Fire both calls before awaiting either — this is the exact shape of
  // React StrictMode's double-effect mount in dev.
  const a = useStore.getState().hydrate();
  const b = useStore.getState().hydrate();
  await Promise.all([a, b]);

  const persisted = await loadAllEvents();
  // Seed lays down N unique events; nothing should land twice.
  const expected = buildSeedEvents(todayMs()).length;
  assert.equal(
    persisted.length,
    expected,
    `concurrent hydrate must seed exactly once (got ${persisted.length}, expected ${expected})`,
  );

  // Belt-and-braces: no two events with the same (title, start).
  const seen = new Set<string>();
  for (const ev of persisted) {
    const k = `${ev.title}@${ev.start}@${ev.end}`;
    assert.ok(!seen.has(k), `duplicate event ${k}`);
    seen.add(k);
  }
});

test('seedIfEmpty is a no-op when store has events, inserts when empty', async () => {
  resetEverything();
  await useStore.getState().hydrate();

  const seedBatch = buildSeedEvents(todayMs());
  const noop = await useStore.getState().seedIfEmpty(seedBatch);
  assert.equal(noop, 0, 'must be a no-op once store is populated');

  // Wipe IDB and store *but keep seed.v1 meta* — recovery scenario where
  // someone cleared events but the meta flag survived.
  await clearAllEvents();
  useStore.setState({ events: {}, hydrated: true });

  const inserted = await useStore.getState().seedIfEmpty(seedBatch);
  assert.equal(inserted, seedBatch.length, 'must insert the whole batch when empty');
  const persisted = await loadAllEvents();
  assert.equal(persisted.length, seedBatch.length, 'inserts must land in IDB');
});

test('CRUD: createEvent → updateEvent → deleteEvent round-trip through IDB', async () => {
  resetEverything();
  // Skip the auto-seed by pre-flipping the meta gate.
  await setMeta('seed.v1', true);
  await useStore.getState().hydrate();
  assert.equal((await loadAllEvents()).length, 0, 'no auto-seed when meta is set');

  const id = uid();
  const start = addMinutesMs(startOfDayMs(todayMs()), 9 * 60);
  const ev: CalEvent = {
    id,
    title: 'Smoke test event',
    start,
    end: addMinutesMs(start, 30),
    color: 'indigo',
    updatedAt: Date.now(),
  };

  await useStore.getState().createEvent(ev);
  let persisted = await loadAllEvents();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]!.title, 'Smoke test event');
  assert.equal(persisted[0]!.color, 'indigo');

  await useStore
    .getState()
    .updateEvent({ ...ev, title: 'Renamed', color: 'emerald' });
  persisted = await loadAllEvents();
  const renamed = persisted.find((e) => e.id === id)!;
  assert.equal(renamed.title, 'Renamed');
  assert.equal(renamed.color, 'emerald');

  await useStore.getState().deleteEvent(id);
  persisted = await loadAllEvents();
  assert.equal(persisted.length, 0, 'delete must remove from IDB');
});

test('undo + redo restore prior state through IDB', async () => {
  resetEverything();
  await setMeta('seed.v1', true);
  await useStore.getState().hydrate();

  const id = uid();
  const start = addMinutesMs(startOfDayMs(todayMs()), 10 * 60);
  const ev: CalEvent = {
    id,
    title: 'Undoable',
    start,
    end: addMinutesMs(start, 60),
    color: 'rose',
    updatedAt: Date.now(),
  };

  await useStore.getState().createEvent(ev);
  await useStore.getState().deleteEvent(id);
  assert.equal((await loadAllEvents()).length, 0, 'delete commits to IDB');

  await useStore.getState().undo(); // un-delete
  let persisted = await loadAllEvents();
  assert.equal(persisted.length, 1, 'undo of delete restores to IDB');
  assert.equal(persisted[0]!.id, id);

  await useStore.getState().redo(); // re-apply delete
  persisted = await loadAllEvents();
  assert.equal(persisted.length, 0, 'redo of delete removes again');
});

test('upsertEvent + commitEvent(prev=null) is undoable as a create (regression: n+Save)', async () => {
  // Reproduces the SAM-CAL-POLISH bug where pressing `n` then Save logged
  // an `update` undo entry (draft → filled) so undo restored an empty draft
  // instead of removing the event.
  resetEverything();
  await setMeta('seed.v1', true);
  await useStore.getState().hydrate();

  const baseline = (await loadAllEvents()).length;
  const id = uid();
  const start = addMinutesMs(startOfDayMs(todayMs()), 14 * 60);
  const draft: CalEvent = {
    id,
    title: '',
    start,
    end: addMinutesMs(start, 60),
    color: 'indigo',
    updatedAt: Date.now(),
  };

  // Hotkeys `n` flow: write the draft without history.
  await useStore.getState().upsertEvent(draft);
  // Editor commits filled-in event with prev=null so commitEvent logs `create`.
  const filled: CalEvent = { ...draft, title: 'New from n', updatedAt: Date.now() };
  await useStore.getState().updateEvent(filled, { history: false });
  await useStore.getState().commitEvent(id, null, 'Create event');

  assert.equal(
    (await loadAllEvents()).length,
    baseline + 1,
    'after save the event is in IDB',
  );

  await useStore.getState().undo();
  assert.equal(
    (await loadAllEvents()).length,
    baseline,
    'undo of a fresh-draft create REMOVES the event (not revert-to-draft)',
  );
  assert.equal(
    useStore.getState().events[id],
    undefined,
    'undo also clears in-memory map',
  );

  await useStore.getState().redo();
  assert.equal(
    useStore.getState().events[id]?.title,
    'New from n',
    'redo restores the filled-in event',
  );
});

test('loadEventsInRange returns only events overlapping the window', async () => {
  resetEverything();
  await useStore.getState().hydrate(); // gets the demo seed

  const dayStart = startOfDayMs(todayMs());
  const dayEnd = endOfDayMs(todayMs());

  const inRange = await loadEventsInRange(dayStart, dayEnd);
  assert.ok(inRange.length > 0, 'today should have ≥1 event after seeding');
  for (const ev of inRange) {
    assert.ok(
      ev.start < dayEnd && ev.end > dayStart,
      `event "${ev.title}" should overlap today`,
    );
  }

  // Far-future events must not be returned by today's range.
  const all = await loadAllEvents();
  const farFuture = all.filter((ev) => ev.start >= addDaysMs(todayMs(), 30));
  for (const ev of farFuture) {
    assert.ok(
      !inRange.some((r) => r.id === ev.id),
      `far-future "${ev.title}" should not appear in today's range`,
    );
  }
});

test('buildSeedEvents is deterministic for a fixed anchor day', () => {
  const a = buildSeedEvents(todayMs());
  const b = buildSeedEvents(todayMs());
  const shape = (evs: CalEvent[]) =>
    evs
      .map(
        (ev) =>
          `${ev.start}|${ev.end}|${ev.title}|${ev.color}|${ev.allDay ? 1 : 0}`,
      )
      .sort();
  assert.deepEqual(shape(a), shape(b), 'same anchor → same shape');
  assert.ok(a.length >= 15, `seed should produce ≥15 events, got ${a.length}`);
});
