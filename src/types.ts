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
  /** ms-since-epoch of last update — for conflict resolution */
  updatedAt: number;
};

export type ViewMode = 'month' | 'week' | 'day';

export type Theme = 'system' | 'dark' | 'light';

/** Metadata stored alongside events to gate one-time migrations / seeding. */
export type CalMeta = {
  key: string;
  value: unknown;
  updatedAt: number;
};
