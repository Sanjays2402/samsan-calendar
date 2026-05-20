/**
 * Pure selectors over the in-memory event map.
 *
 * Kept deliberately free of zustand and IDB so they can be unit-tested
 * without jsdom or a DB shim, and so they can be reused as plain functions
 * by the future server-side ICS export.
 *
 * SAM-70 — these selectors now transparently expand recurring events via
 * `src/lib/recur.ts`. Renderers don't need to know the difference between
 * a one-off event and an exploded occurrence: they get a flat list keyed by
 * `id` (which is either the master id or `<masterId>__<startMs>`).
 */
import type { CalEvent } from '../types';
import { sameDay, startOfDayMs, endOfDayMs } from '../lib/date';
import { expandAllInRange } from '../lib/recur';

export type EventMap = Readonly<Record<string, CalEvent>>;

/** Sort by start ascending, breaking ties on shorter-first then id. */
export function sortByStart(a: CalEvent, b: CalEvent): number {
  if (a.start !== b.start) return a.start - b.start;
  const aDur = a.end - a.start;
  const bDur = b.end - b.start;
  if (aDur !== bDur) return aDur - bDur;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Returns events that overlap [startMs, endMs), sorted by start. */
export function selectEventsInRange(
  events: EventMap,
  startMs: number,
  endMs: number,
): CalEvent[] {
  if (endMs <= startMs) return [];
  const out = expandAllInRange(
    events as Record<string, CalEvent>,
    startMs,
    endMs,
  );
  out.sort(sortByStart);
  return out;
}

/** Events touching the local day containing `dayMs`. */
export function selectEventsForDay(
  events: EventMap,
  dayMs: number,
): CalEvent[] {
  const start = startOfDayMs(dayMs);
  const end = endOfDayMs(dayMs) + 1; // make exclusive
  return selectEventsInRange(events, start, end);
}

/** Just the all-day events on a given day. */
export function selectAllDayForDay(
  events: EventMap,
  dayMs: number,
): CalEvent[] {
  return selectEventsForDay(events, dayMs).filter((ev) => ev.allDay === true);
}

/** Timed (not all-day) events on a given day. */
export function selectTimedForDay(
  events: EventMap,
  dayMs: number,
): CalEvent[] {
  return selectEventsForDay(events, dayMs).filter((ev) => ev.allDay !== true);
}

/** Whether two events overlap by at least a minute. */
export function eventsOverlap(a: CalEvent, b: CalEvent): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Count of events on a given day (timed + all-day). */
export function countForDay(events: EventMap, dayMs: number): number {
  let n = 0;
  for (const ev of Object.values(events)) {
    if (
      sameDay(ev.start, dayMs) ||
      sameDay(ev.end, dayMs) ||
      (ev.start <= dayMs && ev.end >= dayMs)
    ) {
      n += 1;
    }
  }
  return n;
}
