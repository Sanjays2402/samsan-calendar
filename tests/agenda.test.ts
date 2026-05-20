/**
 * SAM-65 — agenda section builder smoke tests.
 *
 * Pure module (no DOM, no IDB). Verifies:
 *   1. Empty days are skipped entirely
 *   2. Chronological order with ties broken by all-day → start → shorter
 *   3. Multi-day events stamp onto every day they touch (within window)
 *   4. Events outside the window are filtered out
 *   5. `through` is treated as inclusive (event ending at the last ms is kept)
 *
 * Run with: pnpm test:agenda
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { buildAgendaSections } from '../src/lib/agenda';
import {
  addDaysMs,
  endOfDayMs,
  startOfDayMs,
  todayMs,
} from '../src/lib/date';
import type { CalEvent } from '../src/types';

const HOUR = 60 * 60 * 1000;

function ev(partial: Partial<CalEvent> & { id: string; start: number; end: number }): CalEvent {
  return {
    title: partial.title ?? partial.id,
    color: partial.color ?? 'indigo',
    updatedAt: 1,
    ...partial,
  };
}

function asMap(events: CalEvent[]): Record<string, CalEvent> {
  const m: Record<string, CalEvent> = {};
  for (const e of events) m[e.id] = e;
  return m;
}

// --------------------------------------------------------------------------
// 1. Empty days are skipped
// --------------------------------------------------------------------------

test('agenda: skips days with no events', () => {
  const today = startOfDayMs(todayMs());
  // Two events: one today, one 3 days from now. Days 1 and 2 should not
  // appear in the result at all.
  const events = asMap([
    ev({ id: 'a', start: today + 9 * HOUR, end: today + 10 * HOUR }),
    ev({
      id: 'b',
      start: addDaysMs(today, 3) + 14 * HOUR,
      end: addDaysMs(today, 3) + 15 * HOUR,
    }),
  ]);
  const sections = buildAgendaSections(
    events,
    today,
    endOfDayMs(addDaysMs(today, 6)),
  );
  assert.equal(sections.length, 2, 'expected 2 day sections, got ' + sections.length);
  assert.equal(sections[0]!.day, today);
  assert.equal(sections[1]!.day, addDaysMs(today, 3));
});

// --------------------------------------------------------------------------
// 2. Ordering: all-day first, then by start, ties broken by duration
// --------------------------------------------------------------------------

test('agenda: orders events within a day correctly', () => {
  const today = startOfDayMs(todayMs());
  const longBlock = ev({
    id: 'long',
    start: today + 9 * HOUR,
    end: today + 12 * HOUR, // 3h
  });
  const standup = ev({
    id: 'standup',
    start: today + 9 * HOUR,
    end: today + 9 * HOUR + 30 * 60 * 1000, // same start, shorter
  });
  const lunch = ev({
    id: 'lunch',
    start: today + 12 * HOUR,
    end: today + 13 * HOUR,
  });
  const holiday = ev({
    id: 'holiday',
    start: today,
    end: endOfDayMs(today),
    allDay: true,
  });
  const sections = buildAgendaSections(
    asMap([longBlock, lunch, standup, holiday]),
    today,
    endOfDayMs(today),
  );
  assert.equal(sections.length, 1);
  const order = sections[0]!.events.map((e) => e.id);
  assert.deepEqual(
    order,
    ['holiday', 'standup', 'long', 'lunch'],
    'expected all-day → shorter@9 → longer@9 → noon, got ' + order.join(','),
  );
});

// --------------------------------------------------------------------------
// 3. Multi-day events appear on every day they touch
// --------------------------------------------------------------------------

test('agenda: multi-day event stamps onto every day in window', () => {
  const today = startOfDayMs(todayMs());
  const trip = ev({
    id: 'trip',
    start: today + 8 * HOUR,
    end: addDaysMs(today, 2) + 17 * HOUR, // spans today, +1, +2
  });
  const sections = buildAgendaSections(
    asMap([trip]),
    today,
    endOfDayMs(addDaysMs(today, 5)),
  );
  assert.equal(sections.length, 3, 'expected 3 day sections');
  for (const s of sections) {
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0]!.id, 'trip');
  }
  assert.deepEqual(
    sections.map((s) => s.day),
    [today, addDaysMs(today, 1), addDaysMs(today, 2)],
  );
});

// --------------------------------------------------------------------------
// 4. Events outside the window are filtered out
// --------------------------------------------------------------------------

test('agenda: filters out events outside the window', () => {
  const today = startOfDayMs(todayMs());
  const past = ev({
    id: 'past',
    start: addDaysMs(today, -3) + 10 * HOUR,
    end: addDaysMs(today, -3) + 11 * HOUR,
  });
  const future = ev({
    id: 'future',
    start: addDaysMs(today, 90) + 10 * HOUR,
    end: addDaysMs(today, 90) + 11 * HOUR,
  });
  const sections = buildAgendaSections(
    asMap([past, future]),
    today,
    endOfDayMs(addDaysMs(today, 30)),
  );
  assert.equal(sections.length, 0);
});

// --------------------------------------------------------------------------
// 5. `through` is inclusive
// --------------------------------------------------------------------------

test('agenda: through boundary is inclusive', () => {
  const today = startOfDayMs(todayMs());
  const through = endOfDayMs(today);
  // Event ends exactly at the last ms of the window — must be kept.
  const justInside = ev({
    id: 'edge',
    start: through - HOUR,
    end: through,
  });
  const sections = buildAgendaSections(
    asMap([justInside]),
    today,
    through,
  );
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.events[0]!.id, 'edge');
});

// --------------------------------------------------------------------------
// 6. Empty input → empty output (no crash)
// --------------------------------------------------------------------------

test('agenda: empty events map returns empty sections', () => {
  const today = startOfDayMs(todayMs());
  const sections = buildAgendaSections({}, today, endOfDayMs(addDaysMs(today, 7)));
  assert.deepEqual(sections, []);
});
