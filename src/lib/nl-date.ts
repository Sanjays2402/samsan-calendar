/**
 * Tiny natural-language date parser for the command palette's "jump to
 * date" affordance. NOT a general-purpose chrono replacement — just enough
 * to feel magical for the obvious cases:
 *
 *   today, tomorrow, yesterday
 *   monday … sunday   (next occurrence, including today)
 *   next monday       (always next week, skipping today)
 *   last monday
 *   mar 15, march 15, mar 15 2027
 *   3/15, 3-15, 03/15/2027, 2027-03-15
 *   15 march, 15 mar
 *   in 3 days, in 2 weeks, in 1 month
 *   +3d, -2w
 *
 * Returns the start-of-day ms for the inferred date, plus a human-readable
 * label suitable for displaying in the palette. Returns `null` if the input
 * isn't recognizably date-shaped (so the palette can fall through to fuzzy).
 */

import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isValid,
  parse,
  startOfDay,
} from 'date-fns';

export type ParsedDate = {
  date: Date;
  label: string;
  /** Higher is more confident. Used to rank against fuzzy matches. */
  confidence: number;
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function startOfDayLocal(d: Date): Date {
  return startOfDay(d);
}

function nextWeekday(from: Date, target: number, skipToday = false): Date {
  const cur = from.getDay();
  let diff = (target - cur + 7) % 7;
  if (diff === 0 && skipToday) diff = 7;
  return addDays(from, diff);
}

function prevWeekday(from: Date, target: number): Date {
  const cur = from.getDay();
  let diff = (cur - target + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(from, -diff);
}

function fmtLabel(d: Date): string {
  return format(d, 'EEE, MMM d, yyyy');
}

/** Try to parse `raw` as a date. Returns null on no recognized shape. */
export function parseNlDate(raw: string, now = new Date()): ParsedDate | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const today = startOfDayLocal(now);

  // ---- Single-word shortcuts ---------------------------------------------
  if (s === 'today') {
    return { date: today, label: 'Today', confidence: 100 };
  }
  if (s === 'tomorrow' || s === 'tmrw' || s === 'tmr') {
    return {
      date: addDays(today, 1),
      label: `Tomorrow · ${fmtLabel(addDays(today, 1))}`,
      confidence: 95,
    };
  }
  if (s === 'yesterday') {
    return {
      date: addDays(today, -1),
      label: `Yesterday · ${fmtLabel(addDays(today, -1))}`,
      confidence: 95,
    };
  }

  // ---- "next monday" / "last friday" -------------------------------------
  const nextPrev = s.match(/^(next|last|this)\s+(\w+)$/);
  if (nextPrev) {
    const [, dir, word] = nextPrev;
    const wd = WEEKDAYS[word!];
    if (wd !== undefined) {
      const date =
        dir === 'last'
          ? prevWeekday(today, wd)
          : nextWeekday(today, wd, dir === 'next');
      const label =
        dir === 'last'
          ? `Last ${capitalize(word!)} · ${fmtLabel(date)}`
          : dir === 'next'
            ? `Next ${capitalize(word!)} · ${fmtLabel(date)}`
            : `${capitalize(word!)} · ${fmtLabel(date)}`;
      return { date, label, confidence: 90 };
    }
  }

  // ---- bare weekday "monday" → next occurrence (today counts) ------------
  if (s in WEEKDAYS) {
    const target = WEEKDAYS[s]!;
    const date = nextWeekday(today, target, false);
    return { date, label: fmtLabel(date), confidence: 80 };
  }

  // ---- "in 3 days" / "in 2 weeks" / "in 1 month" -------------------------
  const inMatch = s.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months|d|w|m)$/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2]!;
    const date = applyUnit(today, n, unit);
    return {
      date,
      label: `In ${n} ${unit} · ${fmtLabel(date)}`,
      confidence: 75,
    };
  }

  // ---- "+3d" / "-2w" / "+1m" ---------------------------------------------
  const offset = s.match(/^([+-])\s*(\d+)\s*([dwm])$/);
  if (offset) {
    const sign = offset[1] === '-' ? -1 : 1;
    const n = Number(offset[2]) * sign;
    const date = applyUnit(today, n, offset[3]!);
    return {
      date,
      label: `${offset[1]}${Math.abs(n)} ${unitName(offset[3]!)} · ${fmtLabel(date)}`,
      confidence: 75,
    };
  }

  // ---- ISO "2027-03-15" --------------------------------------------------
  {
    const iso = tryParse(s, 'yyyy-MM-dd', now);
    if (iso) return { date: iso, label: fmtLabel(iso), confidence: 90 };
  }

  // ---- "3/15", "3-15", "03/15/2027" --------------------------------------
  const slashy = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slashy) {
    const month = Number(slashy[1]) - 1;
    const day = Number(slashy[2]);
    const yearRaw = slashy[3];
    let year = now.getFullYear();
    if (yearRaw) {
      year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    } else {
      // If the date is already in the past this year, assume next year.
      const candidate = new Date(year, month, day);
      if (startOfDayLocal(candidate).getTime() < today.getTime()) year += 1;
    }
    const candidate = new Date(year, month, day);
    if (isValid(candidate) && candidate.getMonth() === month) {
      return {
        date: startOfDayLocal(candidate),
        label: fmtLabel(candidate),
        confidence: 85,
      };
    }
  }

  // ---- "march 15" / "mar 15" / "mar 15 2027" -----------------------------
  const monthFirst = s.match(/^(\w+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1]!];
    if (month !== undefined) {
      const day = Number(monthFirst[2]);
      let year = now.getFullYear();
      if (monthFirst[3]) {
        year =
          monthFirst[3]!.length === 2
            ? 2000 + Number(monthFirst[3])
            : Number(monthFirst[3]);
      } else {
        const candidate = new Date(year, month, day);
        if (startOfDayLocal(candidate).getTime() < today.getTime()) year += 1;
      }
      const candidate = new Date(year, month, day);
      if (isValid(candidate)) {
        return {
          date: startOfDayLocal(candidate),
          label: fmtLabel(candidate),
          confidence: 85,
        };
      }
    }
  }

  // ---- "15 march" / "15 mar" / "15 march 2027" ---------------------------
  const dayFirst = s.match(/^(\d{1,2})\s+(\w+)(?:\s+(\d{2,4}))?$/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2]!];
    if (month !== undefined) {
      const day = Number(dayFirst[1]);
      let year = now.getFullYear();
      if (dayFirst[3]) {
        year =
          dayFirst[3]!.length === 2
            ? 2000 + Number(dayFirst[3])
            : Number(dayFirst[3]);
      } else {
        const candidate = new Date(year, month, day);
        if (startOfDayLocal(candidate).getTime() < today.getTime()) year += 1;
      }
      const candidate = new Date(year, month, day);
      if (isValid(candidate)) {
        return {
          date: startOfDayLocal(candidate),
          label: fmtLabel(candidate),
          confidence: 85,
        };
      }
    }
  }

  return null;
}

function applyUnit(d: Date, n: number, unit: string): Date {
  if (unit === 'd' || unit.startsWith('day')) return addDays(d, n);
  if (unit === 'w' || unit.startsWith('week')) return addWeeks(d, n);
  if (unit === 'm' || unit.startsWith('month')) return addMonths(d, n);
  return d;
}

function unitName(u: string): string {
  if (u === 'd') return 'days';
  if (u === 'w') return 'weeks';
  if (u === 'm') return 'months';
  return u;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function tryParse(s: string, pattern: string, now: Date): Date | null {
  const d = parse(s, pattern, now);
  return isValid(d) ? startOfDayLocal(d) : null;
}
