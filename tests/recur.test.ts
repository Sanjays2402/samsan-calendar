/**
 * SAM-70 recurrence-layer tests.
 *
 * Contract owned by `src/lib/recur.ts`:
 *
 *   1. expandOccurrences returns just the master event if rrule is unset
 *   2. WEEKLY MO/WE/FR series expands to the right local-time instances inside a window
 *   3. DAILY COUNT=5 series is bounded by COUNT, not the window
 *   4. UNTIL clause stops the series at the right local-time boundary
 *   5. virtual occurrences carry id = `<series-id>__<startMs>` and seriesId === master.id
 *   6. resolveSeriesId() splits a virtual id back into its master id
 *   7. selectEventsInRange transparently expands recurring events from the store
 *   8. ICS exporter emits a single VEVENT with RRULE for a recurring series
 *
 * Run with: pnpm test:recur
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  expandOccurrences,
  resolveSeriesId,
  isVirtualOccurrence,
  occurrenceId,
} from '../src/lib/recur';
import { selectEventsInRange } from '../src/store/selectors';
import {
  _resetHydrateGuardForTests,
  useStore,
} from '../src/store/calendar';
import { _resetDbForTests, loadAllEvents, setMeta } from '../src/lib/storage';
import { eventsToIcs } from '../src/lib/ics';
import {
  addDaysMs,
  addMinutesMs,
  startOfDayMs,
  todayMs,
} from '../src/lib/date';
import type { CalEvent } from '../src/types';

function makeEvent(partial: Partial<CalEvent> & Pick<CalEvent, 'start' | 'end'>): CalEvent {
  return {
    id: partial.id ?? 'ev-1',
    title: partial.title ?? 'Test',
    color: partial.color ?? 'indigo',
    updatedAt: partial.updatedAt ?? 1700000000000,
    ...partial,
  } as CalEvent;
}

test('expandOccurrences returns the master event when rrule is unset', () => {
  const start = addMinutesMs(startOfDayMs(todayMs()), 9 * 60);
  const ev = makeEvent({ start, end: addMinutesMs(start, 30) });
  const out = expandOccurrences(ev, start - 1, start + 24 * 60 * 60 * 1000);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.id, ev.id, 'non-recurring keeps its raw id');
});

test('WEEKLY MO/WE/FR series expands to the right instances inside a 14-day window', () => {
  // Anchor: a known Monday in local time (2026-02-02 is a Monday).
  // Using a fixed anchor keeps the test deterministic across machines.
  const monday = new Date(2026, 1, 2, 9, 0, 0, 0).getTime();
  const ev = makeEvent({
    id: 'standup',
    title: 'Standup',
    start: monday,
    end: monday + 15 * 60 * 1000,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  });

  const windowStart = monday;
  const windowEnd = monday + 14 * 24 * 60 * 60 * 1000; // 2 weeks
  const occs = expandOccurrences(ev, windowStart, windowEnd);

  // 2 weeks × 3 days/wk = 6 instances
  assert.equal(occs.length, 6, `expected 6 occurrences, got ${occs.length}`);
  for (const o of occs) {
    // All instances should preserve the 09:00 local start time.
    const d = new Date(o.start);
    assert.equal(d.getHours(), 9, 'occurrence preserves local hour');
    assert.equal(d.getMinutes(), 0, 'occurrence preserves local minute');
    // Each lasts the same duration as the master.
    assert.equal(o.end - o.start, 15 * 60 * 1000);
    // All belong to the same series.
    assert.equal(o.seriesId, 'standup');
  }
});

test('DAILY COUNT=5 series is bounded by COUNT, not the window', () => {
  const start = new Date(2026, 1, 2, 10, 0, 0, 0).getTime();
  const ev = makeEvent({
    id: 'daily-5',
    start,
    end: start + 30 * 60 * 1000,
    rrule: 'FREQ=DAILY;COUNT=5',
  });
  const occs = expandOccurrences(ev, start, start + 30 * 24 * 60 * 60 * 1000);
  assert.equal(occs.length, 5, 'COUNT caps the series');
});

test('UNTIL clause stops the series at the right local-time boundary', () => {
  const start = new Date(2026, 1, 2, 8, 0, 0, 0).getTime(); // Mon Feb 2 08:00
  // UNTIL must be expressed in UTC per RFC 5545. Pick the UTC equivalent of
  // local Friday Feb 6 23:59:59 — i.e. add 4 days from local 8am start, then
  // bump past end-of-day in UTC.
  const untilLocal = new Date(2026, 1, 6, 23, 59, 59, 0);
  const untilUtc =
    untilLocal.getUTCFullYear().toString().padStart(4, '0') +
    (untilLocal.getUTCMonth() + 1).toString().padStart(2, '0') +
    untilLocal.getUTCDate().toString().padStart(2, '0') +
    'T' +
    untilLocal.getUTCHours().toString().padStart(2, '0') +
    untilLocal.getUTCMinutes().toString().padStart(2, '0') +
    untilLocal.getUTCSeconds().toString().padStart(2, '0') +
    'Z';
  const ev = makeEvent({
    id: 'daily-until',
    start,
    end: start + 60 * 60 * 1000,
    rrule: `FREQ=DAILY;UNTIL=${untilUtc}`,
  });
  const occs = expandOccurrences(ev, start, start + 30 * 24 * 60 * 60 * 1000);
  // Mon..Fri = 5 occurrences
  assert.equal(occs.length, 5, `expected 5 occurrences with UNTIL, got ${occs.length}`);
});

test('virtual occurrence ids are stable and resolveSeriesId() inverts them', () => {
  const start = new Date(2026, 1, 2, 9, 0, 0, 0).getTime();
  const ev = makeEvent({
    id: 'series-xyz',
    start,
    end: start + 60 * 60 * 1000,
    rrule: 'FREQ=DAILY;COUNT=3',
  });
  const occs = expandOccurrences(ev, start, start + 7 * 24 * 60 * 60 * 1000);
  assert.equal(occs.length, 3);

  // First instance keeps its master id (so editing "from the first
  // occurrence" stays anchored on the series).
  assert.equal(occs[0]!.id, 'series-xyz');
  assert.equal(resolveSeriesId(occs[0]!.id), 'series-xyz');
  assert.equal(isVirtualOccurrence(occs[0]!.id), false);

  // Later instances are virtual.
  assert.equal(occs[1]!.id, occurrenceId('series-xyz', occs[1]!.start));
  assert.ok(occs[1]!.id.startsWith('series-xyz__'));
  assert.equal(resolveSeriesId(occs[1]!.id), 'series-xyz');
  assert.equal(isVirtualOccurrence(occs[1]!.id), true);
});

test('selectEventsInRange transparently expands recurring events from the store', () => {
  const monday = new Date(2026, 1, 2, 9, 0, 0, 0).getTime();
  const map: Record<string, CalEvent> = {
    standup: makeEvent({
      id: 'standup',
      title: 'Standup',
      start: monday,
      end: monday + 15 * 60 * 1000,
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    }),
    once: makeEvent({
      id: 'once',
      title: 'One-off',
      start: monday + 6 * 60 * 60 * 1000,
      end: monday + 7 * 60 * 60 * 1000,
    }),
  };

  // Look at one workweek.
  const out = selectEventsInRange(map, monday, monday + 5 * 24 * 60 * 60 * 1000);
  assert.equal(out.length, 6, `expected 5 standups + 1 one-off, got ${out.length}`);
  const standups = out.filter((e) => e.title === 'Standup');
  assert.equal(standups.length, 5);
  // Sorted by start ascending.
  for (let i = 1; i < out.length; i += 1) {
    assert.ok(out[i - 1]!.start <= out[i]!.start, 'output is sorted by start');
  }
});

test('ICS exporter emits a single VEVENT carrying the RRULE for a recurring series', () => {
  const start = new Date(2026, 1, 2, 9, 0, 0, 0).getTime();
  const ev = makeEvent({
    id: 'standup-x',
    title: 'Standup',
    start,
    end: start + 15 * 60 * 1000,
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
  });
  const ics = eventsToIcs([ev]);
  // Exactly one VEVENT block.
  const events = ics.split(/\r?\n/).filter((l) => l === 'BEGIN:VEVENT');
  assert.equal(events.length, 1, 'recurring series exports as a single VEVENT');
  assert.ok(/RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10/.test(ics), 'RRULE line present');
});
