import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const WEEK_STARTS_ON = 0 as const; // Sunday — change later if needed

export function fmt(ms: number, pattern: string): string {
  return format(new Date(ms), pattern);
}

export function dayKey(ms: number): string {
  return format(new Date(ms), 'yyyy-MM-dd');
}

export function todayMs(): number {
  return startOfDay(new Date()).getTime();
}

export function startOfMonthMs(ms: number): number {
  return startOfMonth(new Date(ms)).getTime();
}

export function endOfMonthMs(ms: number): number {
  return endOfMonth(new Date(ms)).getTime();
}

export function startOfWeekMs(ms: number): number {
  return startOfWeek(new Date(ms), { weekStartsOn: WEEK_STARTS_ON }).getTime();
}

export function endOfWeekMs(ms: number): number {
  return endOfWeek(new Date(ms), { weekStartsOn: WEEK_STARTS_ON }).getTime();
}

export function startOfDayMs(ms: number): number {
  return startOfDay(new Date(ms)).getTime();
}

export function endOfDayMs(ms: number): number {
  return endOfDay(new Date(ms)).getTime();
}

export function addDaysMs(ms: number, n: number): number {
  return addDays(new Date(ms), n).getTime();
}

export function addMinutesMs(ms: number, n: number): number {
  return addMinutes(new Date(ms), n).getTime();
}

export function diffMinutes(a: number, b: number): number {
  return differenceInMinutes(new Date(a), new Date(b));
}

export function sameDay(a: number, b: number): boolean {
  return isSameDay(new Date(a), new Date(b));
}

export function sameMonth(a: number, b: number): boolean {
  return isSameMonth(new Date(a), new Date(b));
}

export function isTodayMs(ms: number): boolean {
  return isToday(new Date(ms));
}

export function inInterval(ms: number, startMs: number, endMs: number): boolean {
  return isWithinInterval(new Date(ms), {
    start: new Date(startMs),
    end: new Date(endMs),
  });
}

/** Snap minutes to a grid (e.g. 15min). Returns ms. */
export function snapToMinutes(ms: number, step: number): number {
  const d = new Date(ms);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const snapped = Math.round(minutes / step) * step;
  d.setHours(0, 0, 0, 0);
  return d.getTime() + snapped * 60_000;
}

/** Floor minutes to a grid (e.g. 15min) — used while dragging. */
export function floorToMinutes(ms: number, step: number): number {
  const d = new Date(ms);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const floored = Math.floor(minutes / step) * step;
  d.setHours(0, 0, 0, 0);
  return d.getTime() + floored * 60_000;
}

/**
 * Build a 6-row × 7-col matrix of day timestamps covering `monthMs`.
 * Includes leading/trailing days from adjacent months.
 */
export function monthMatrix(monthMs: number): number[][] {
  const first = startOfMonth(new Date(monthMs));
  const start = startOfWeek(first, { weekStartsOn: WEEK_STARTS_ON });
  const rows: number[][] = [];
  for (let r = 0; r < 6; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < 7; c += 1) {
      row.push(addDays(start, r * 7 + c).getTime());
    }
    rows.push(row);
  }
  return rows;
}

/** Build a 7-element array for the week containing `weekMs`. */
export function weekDays(weekMs: number): number[] {
  const start = startOfWeek(new Date(weekMs), { weekStartsOn: WEEK_STARTS_ON });
  const days: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(addDays(start, i).getTime());
  }
  return days;
}

/** Hours array 0-23 for time grid. */
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Minutes per pixel for a 24h × `slotHeight` grid. */
export function minutesPerPx(slotHeight: number): number {
  return 60 / slotHeight;
}

/** Format a duration like "1h 15m" or "30m". */
export function fmtDuration(startMs: number, endMs: number): string {
  const mins = Math.max(0, diffMinutes(endMs, startMs));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format a time-of-day suitable for the UI: "9:00 AM" → "9:00a", noon → "12p" */
export function fmtTime(ms: number): string {
  return format(new Date(ms), 'h:mma').replace('AM', 'a').replace('PM', 'p');
}

export function fmtTimeMono(ms: number): string {
  // for time-gutter labels: "09" vs "10p" — use 12h compact
  const d = new Date(ms);
  const h = d.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}
