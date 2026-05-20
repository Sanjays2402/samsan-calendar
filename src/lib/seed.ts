import type { CalEvent, EventColor } from '../types';
import {
  addDaysMs,
  addMinutesMs,
  startOfDayMs,
  startOfWeekMs,
  todayMs,
} from './date';
import { uid } from './uid';

/**
 * Deterministic-feeling event seeds spanning ~12 weeks around today.
 *
 * Constraints:
 *   - reproducible: relative to *today* but uses a seeded PRNG so the same
 *     date produces the same set across reloads on the same day
 *   - realistic: weekday work blocks, recurring standups, occasional all-day
 *     events, scattered evenings, weekend brunches, mix of durations
 *   - ~120 events — enough to populate every visible cell of month view
 *   - balanced across the 6 event colors
 */

const COLORS: EventColor[] = ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'];

/** Tiny seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

type Template = {
  title: string;
  color: EventColor;
  /** start hour (0-23, 24h), local */
  startHour: number;
  startMin?: number;
  /** duration in minutes */
  duration: number;
  /** which weekdays this template runs (0=Sun .. 6=Sat); empty = any */
  daysOfWeek?: number[];
  /** every Nth week (1 = every week). default 1 */
  weekly?: number;
};

/* ─── Weekly cadence templates (drive most events) ─────────────────────────── */
const WEEKLY_TEMPLATES: readonly Template[] = [
  // Recurring rituals — Mon-Fri
  { title: 'Standup',                  color: 'indigo',  startHour: 9,  startMin: 30, duration: 15, daysOfWeek: [1, 2, 3, 4, 5] },
  { title: 'Focus: deep work',         color: 'violet',  startHour: 10, startMin: 0,  duration: 90, daysOfWeek: [1, 3, 5] },
  { title: 'Lunch',                    color: 'amber',   startHour: 12, startMin: 30, duration: 45, daysOfWeek: [1, 2, 3, 4, 5] },
  { title: '1:1 with manager',         color: 'sky',     startHour: 14, startMin: 0,  duration: 30, daysOfWeek: [2] },
  { title: 'Design review',            color: 'emerald', startHour: 15, startMin: 0,  duration: 60, daysOfWeek: [3] },
  { title: 'Eng all-hands',            color: 'rose',    startHour: 11, startMin: 0,  duration: 45, daysOfWeek: [4] },
  { title: 'Pairing — auth refactor',  color: 'indigo',  startHour: 14, startMin: 30, duration: 75, daysOfWeek: [4] },
  { title: 'Demo Friday',              color: 'emerald', startHour: 16, startMin: 0,  duration: 45, daysOfWeek: [5] },

  // Personal weekly
  { title: 'Yoga',                     color: 'amber',   startHour: 7,  startMin: 30, duration: 60, daysOfWeek: [2, 4] },
  { title: 'Long run',                 color: 'emerald', startHour: 8,  startMin: 0,  duration: 75, daysOfWeek: [6] },
  { title: 'Date night',               color: 'rose',    startHour: 19, startMin: 30, duration: 120, daysOfWeek: [5] },
  { title: 'Sunday reset',             color: 'sky',     startHour: 17, startMin: 0,  duration: 60, daysOfWeek: [0] },
];

/* ─── One-off events (sprinkled across the window) ─────────────────────────── */
const ONE_OFFS: readonly Omit<Template, 'daysOfWeek' | 'weekly'>[] = [
  { title: 'Quarterly planning',       color: 'indigo',  startHour: 10, startMin: 0,  duration: 180 },
  { title: 'Roadmap workshop',         color: 'violet',  startHour: 13, startMin: 0,  duration: 150 },
  { title: 'Coffee with Priya',        color: 'amber',   startHour: 9,  startMin: 0,  duration: 30 },
  { title: 'Coffee with Sam',          color: 'amber',   startHour: 9,  startMin: 30, duration: 30 },
  { title: 'Dentist',                  color: 'rose',    startHour: 8,  startMin: 0,  duration: 60 },
  { title: 'Therapy',                  color: 'sky',     startHour: 17, startMin: 30, duration: 50 },
  { title: 'Doctor — annual',          color: 'rose',    startHour: 11, startMin: 0,  duration: 45 },
  { title: 'Haircut',                  color: 'amber',   startHour: 18, startMin: 0,  duration: 30 },
  { title: 'Pickup soccer',            color: 'emerald', startHour: 18, startMin: 30, duration: 90 },
  { title: 'Book club',                color: 'violet',  startHour: 19, startMin: 0,  duration: 90 },
  { title: 'Hiroshi’s housewarming',   color: 'rose',    startHour: 19, startMin: 0,  duration: 180 },
  { title: 'Concert — IDLES',          color: 'violet',  startHour: 20, startMin: 0,  duration: 180 },
  { title: 'Movie — Dune III',         color: 'indigo',  startHour: 21, startMin: 0,  duration: 165 },
  { title: 'Family dinner',            color: 'amber',   startHour: 18, startMin: 30, duration: 120 },
  { title: 'Lunch w/ ex-coworker',     color: 'amber',   startHour: 12, startMin: 0,  duration: 75 },
  { title: 'Customer interview',       color: 'sky',     startHour: 11, startMin: 0,  duration: 30 },
  { title: 'Investor sync',            color: 'indigo',  startHour: 14, startMin: 0,  duration: 30 },
  { title: 'Postmortem: outage',       color: 'rose',    startHour: 15, startMin: 30, duration: 60 },
  { title: 'Performance review prep',  color: 'violet',  startHour: 16, startMin: 0,  duration: 60 },
];

function eventAt(
  day: number,
  hour: number,
  minute: number,
  durationMin: number,
): { start: number; end: number } {
  const start = startOfDayMs(day) + hour * 3_600_000 + minute * 60_000;
  const end = addMinutesMs(start, durationMin);
  return { start, end };
}

/**
 * Build the seed set, deterministic for a given anchor day.
 */
export function buildSeedEvents(now: number = todayMs()): CalEvent[] {
  // anchor on Sunday of the week containing today
  const anchor = startOfWeekMs(now);
  const rand = mulberry32(Math.floor(anchor / 86_400_000));
  const out: CalEvent[] = [];

  // weeks: 6 back, 6 forward (12 weeks total ≈ 84 days)
  const FIRST_WEEK_OFFSET = -6 * 7;
  const LAST_WEEK_OFFSET = 6 * 7;

  // Recurring weekly templates
  for (const tpl of WEEKLY_TEMPLATES) {
    const days = tpl.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
    for (let off = FIRST_WEEK_OFFSET; off < LAST_WEEK_OFFSET; off += 7) {
      for (const dow of days) {
        // weekly cadence
        const weekIdx = (off - FIRST_WEEK_OFFSET) / 7;
        if (tpl.weekly && weekIdx % tpl.weekly !== 0) continue;

        // skip some events to avoid a perfect grid (~12% absent)
        if (rand() < 0.12) continue;

        const day = addDaysMs(anchor, off + dow);
        const { start, end } = eventAt(day, tpl.startHour, tpl.startMin ?? 0, tpl.duration);
        out.push({
          id: uid(),
          title: tpl.title,
          start,
          end,
          color: tpl.color,
          updatedAt: anchor,
        });
      }
    }
  }

  // One-off events: sprinkle ~36 across the window
  const oneOffCount = 36;
  for (let i = 0; i < oneOffCount; i++) {
    const tpl = pick(ONE_OFFS, rand);
    const dayOffset = Math.floor(rand() * (LAST_WEEK_OFFSET - FIRST_WEEK_OFFSET));
    const day = addDaysMs(anchor, FIRST_WEEK_OFFSET + dayOffset);
    // light jitter ±30 min
    const jitter = (Math.floor(rand() * 5) - 2) * 15;
    const { start, end } = eventAt(
      day,
      tpl.startHour,
      (tpl.startMin ?? 0) + jitter,
      tpl.duration,
    );
    out.push({
      id: uid(),
      title: tpl.title,
      start,
      end,
      color: tpl.color,
      updatedAt: anchor,
    });
  }

  // All-day events — placed in three runs (back, recent, future)
  // Conf: ReactConf — 2 consecutive days, future
  placeRun(out, anchor, 14, ['Conf: ReactConf', 'Conf: ReactConf'], 'indigo');
  // PTO cabin trip — 3 consecutive days, past
  placeRun(out, anchor, -23, ['PTO — Cabin trip', 'PTO — Cabin trip', 'PTO — Cabin trip'], 'emerald');
  // WFH — single
  placeRun(out, anchor, 3, ['WFH'], 'sky');
  // On-call run — 2 days, future
  placeRun(out, anchor, 21, ['On-call', 'On-call'], 'rose');

  // Today markers — make sure today has 3-4 events for instant payoff
  const today = startOfDayMs(now);
  out.push({
    id: uid(),
    title: 'Standup',
    color: 'indigo',
    ...eventAt(today, 9, 30, 15),
    updatedAt: now,
  });
  out.push({
    id: uid(),
    title: 'Design review — Calendar v0.2',
    color: 'emerald',
    ...eventAt(today, 11, 0, 60),
    updatedAt: now,
  });
  out.push({
    id: uid(),
    title: 'Lunch',
    color: 'amber',
    ...eventAt(today, 12, 30, 45),
    updatedAt: now,
  });
  out.push({
    id: uid(),
    title: 'Coffee with Priya',
    color: 'sky',
    notes: 'New cafe on Pine St — she found us a corner booth',
    ...eventAt(today, 15, 30, 30),
    updatedAt: now,
  });
  // mark colors used so unused don't drop out — ensure violet has presence today week
  out.push({
    id: uid(),
    title: 'Book club: Project Hail Mary',
    color: 'violet',
    ...eventAt(addDaysMs(today, 2), 19, 0, 90),
    updatedAt: now,
  });

  return out;
}

function placeRun(
  out: CalEvent[],
  anchor: number,
  startDayOffset: number,
  titles: readonly string[],
  color: EventColor,
): void {
  for (let i = 0; i < titles.length; i++) {
    const day = addDaysMs(anchor, startDayOffset + i);
    const start = startOfDayMs(day);
    const end = startOfDayMs(addDaysMs(day, 1));
    out.push({
      id: uid(),
      title: titles[i]!,
      start,
      end,
      color,
      allDay: true,
      updatedAt: anchor,
    });
  }
}

/** Export the color list for tests / docs. */
export const SEED_COLORS = COLORS;
