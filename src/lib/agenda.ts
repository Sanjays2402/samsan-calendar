/**
 * Agenda view section builder.
 *
 * Pure module — no DOM, no React, no IDB. Lives outside the component so it
 * can be unit-tested without spinning up React.
 *
 * Semantics:
 *   - Multi-day events appear on every day they touch inside the window.
 *     A 3-day conference belongs in three day sections.
 *   - All-day events float to the top of a day; timed events sort by start;
 *     ties broken by duration (shorter first — surface that 30m standup
 *     above the lunch block).
 *   - Empty days are *skipped entirely*. The agenda is "what's on your
 *     plate", not a date selector.
 */

import { selectEventsInRange } from '../store/selectors';
import { addDaysMs, dayKey, startOfDayMs } from './date';
import type { CalEvent } from '../types';

export type DaySection = {
  /** ms at start-of-day (local) — used as the React key and the display anchor */
  day: number;
  events: CalEvent[];
};

/**
 * Group events into day-keyed sections inside [from, through] (both ms).
 *
 * `from` and `through` are treated as a closed interval; an event ending
 * exactly at `through` is included. The caller is expected to pass
 * startOfDayMs(from) and endOfDayMs(throughDay) — we don't normalize here
 * because the AgendaView already does that and we'd rather not be opinionated
 * about timezones at the helper level.
 */
export function buildAgendaSections(
  events: Record<string, CalEvent>,
  from: number,
  through: number,
): DaySection[] {
  // selectEventsInRange uses [from, to) so we extend by 1ms to keep `through`
  // inclusive — matches the human intuition of "show me events through Sunday".
  const candidates = selectEventsInRange(events, from, through + 1);
  if (candidates.length === 0) return [];

  const byKey = new Map<string, DaySection>();
  for (const ev of candidates) {
    const startDay = startOfDayMs(Math.max(ev.start, from));
    const endDay = startOfDayMs(Math.min(ev.end, through));
    for (let d = startDay; d <= endDay; d = addDaysMs(d, 1)) {
      const key = dayKey(d);
      const section = byKey.get(key);
      if (section) {
        section.events.push(ev);
      } else {
        byKey.set(key, { day: d, events: [ev] });
      }
    }
  }

  const sections = Array.from(byKey.values()).sort((a, b) => a.day - b.day);
  for (const s of sections) {
    s.events.sort((a, b) => {
      const aAll = a.allDay === true ? 0 : 1;
      const bAll = b.allDay === true ? 0 : 1;
      if (aAll !== bAll) return aAll - bAll;
      if (a.start !== b.start) return a.start - b.start;
      return (a.end - a.start) - (b.end - b.start);
    });
  }
  return sections;
}
