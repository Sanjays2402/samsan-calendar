/**
 * Domain types for the calendar.
 *
 * Times are Unix ms — easy to store, easy to compare, easy to JSON.
 * `start <= end`. For all-day events, set `allDay: true` and pin
 * `start` to startOfDay(local) and `end` to endOfDay(local) of the same
 * day (or last day of a multi-day span). Renderers branch on `allDay`.
 */

export type EventColor =
  | 'indigo'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'sky'
  | 'violet';

export type CalEvent = {
  id: string;
  title: string;
  /** Unix ms */
  start: number;
  /** Unix ms — exclusive for timed events, inclusive end-of-day for all-day */
  end: number;
  allDay?: boolean;
  color: EventColor;
  location?: string;
  notes?: string;
  /** Whether the event was system-seeded. Helps the seeder be idempotent. */
  seeded?: boolean;
  /**
   * RFC 5545 RRULE string (without the `RRULE:` prefix), e.g.
   *   "FREQ=WEEKLY;BYDAY=MO,WE,FR"
   *   "FREQ=DAILY;COUNT=5"
   *
   * Only the *master* event in IDB carries this field. The recurrence layer
   * expands it into virtual occurrences on read (`src/lib/recur.ts`).
   * Per-occurrence overrides (EXDATE / exceptions) are intentionally out of
   * scope for v1 — editing a recurring event edits the whole series.
   */
  rrule?: string;
  /**
   * Only present on *expanded* virtual occurrences — never persisted.
   * Points back to the master event's id so renderers and mutation handlers
   * can route edits to the series.
   */
  seriesId?: string;
  /** ms-since-epoch of last update — for conflict resolution */
  updatedAt: number;
};

export type ViewMode = 'month' | 'week' | 'day' | 'agenda';

export type Theme = 'system' | 'dark' | 'light';

/** Metadata stored alongside events to gate one-time migrations / seeding. */
export type CalMeta = {
  key: string;
  value: unknown;
  updatedAt: number;
};
