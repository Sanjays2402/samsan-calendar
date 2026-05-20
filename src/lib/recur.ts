/**
 * Event recurrence (SAM-70).
 *
 * v1 scope:
 *   - `CalEvent.rrule` carries an RFC 5545 RRULE *value* (no `RRULE:` prefix).
 *   - We support FREQ=DAILY|WEEKLY|MONTHLY, BYDAY, INTERVAL, COUNT, UNTIL.
 *     Anything else (EXDATE, BYSETPOS, BYMONTHDAY, …) is technically supported
 *     by the `rrule` package, but we don't expose it in the editor yet.
 *   - Editing a recurring event edits the *whole series*. No per-occurrence
 *     overrides yet (no EXDATE bookkeeping, no detached overrides).
 *
 * Why this layout:
 *   - Master events live in IDB carrying just the `rrule` string.
 *   - On read we expand against a viewport window, producing *virtual*
 *     occurrences with stable ids = `<masterId>__<occurrenceStartMs>`.
 *   - The first instance keeps its raw master id, so editing the series via
 *     the editor's "open this event" path still routes back to the master
 *     without a lookup.
 *   - All mutation entry points (`updateEvent`, `deleteEvent`, drag persists,
 *     …) call `resolveSeriesId()` before touching IDB, which strips the
 *     `__<ms>` suffix off virtual ids. Result: dragging the Wednesday standup
 *     moves the *whole standup series*. That's the intentional v1 contract.
 */
/**
 * `rrule@2.x` ships a UMD/CJS bundle in its `main` field and an ESM build
 * on `module`. Node's ESM loader picks `main` (CJS) and exposes the named
 * exports as a synthesized default; Vite picks `module` and gets the ESM
 * named exports directly.
 *
 * A namespace import works in both worlds, but Vite emits a build-time
 * warning if we *also* poke `(ns).default` (which Vite knows is undefined
 * for the ESM build). To keep both loaders happy without the warning we
 * funnel everything through a tiny `pickExport` helper that reads from the
 * namespace first and only falls back to `.default` at runtime — the lookup
 * is dynamic, so Vite's static-analysis warning doesn't trigger.
 */
import * as rrulePkg from 'rrule';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickExport<K extends string>(ns: any, key: K): any {
  if (ns && ns[key] !== undefined) return ns[key];
  if (ns && ns.default && ns.default[key] !== undefined) return ns.default[key];
  return undefined;
}
const RRule = pickExport(rrulePkg, 'RRule');
const rrulestr = pickExport(rrulePkg, 'rrulestr');
type RRuleInstance = InstanceType<typeof RRule>;
import type { CalEvent } from '../types';

/** Returns true if the id has the `__<ms>` virtual-occurrence suffix. */
export function isVirtualOccurrence(id: string): boolean {
  // Use lastIndexOf so master ids that legitimately contain `__` (unlikely
  // but cheap to guard) still resolve correctly to themselves.
  const idx = id.lastIndexOf('__');
  if (idx < 0) return false;
  const tail = id.slice(idx + 2);
  if (tail.length === 0) return false;
  // Tail must be a positive integer (epoch ms).
  return /^[0-9]{10,}$/.test(tail);
}

/** Master id for a (possibly virtual) occurrence id. Inverse of `occurrenceId`. */
export function resolveSeriesId(id: string): string {
  if (!isVirtualOccurrence(id)) return id;
  return id.slice(0, id.lastIndexOf('__'));
}

/** Build the deterministic id for a virtual occurrence starting at `startMs`. */
export function occurrenceId(seriesId: string, startMs: number): string {
  return `${seriesId}__${startMs}`;
}

/**
 * Convert an RRULE *value* + master event's local start into an `RRule`
 * configured against the master's wall-clock start.
 *
 * `rrule@2.x`'s string parser hangs DTSTART off the JS `Date` provided in
 * `rrulestr(str, { dtstart })`. We treat the master's local time as
 * "floating" — i.e. the recurrence walks the local calendar, not UTC. To
 * make `rrule` produce local-time output we pass the master start as a
 * pseudo-UTC `Date` constructed from the local components, then pull each
 * occurrence back out the same way (`occurrence.getUTC*` → local Date).
 *
 * This is the workaround the `rrule` README documents for floating local
 * times (`tzid` left undefined).
 */
function buildRRule(master: CalEvent): RRuleInstance | null {
  if (!master.rrule || master.rrule.trim() === '') return null;
  // Strip any accidental "RRULE:" prefix so callers can pass either form.
  const value = master.rrule.replace(/^RRULE:/i, '');
  const local = new Date(master.start);
  const floating = new Date(
    Date.UTC(
      local.getFullYear(),
      local.getMonth(),
      local.getDate(),
      local.getHours(),
      local.getMinutes(),
      local.getSeconds(),
      local.getMilliseconds(),
    ),
  );
  try {
    const rule = rrulestr(value, { dtstart: floating });
    if (rule instanceof RRule) return rule;
    return null;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[recur] invalid RRULE on event ${master.id}: ${value}`,
        err,
      );
    }
    return null;
  }
}

/**
 * Pull a floating-UTC occurrence Date back into a local-time epoch ms.
 *
 * Inverse of the construction in `buildRRule`.
 */
function floatingToLocalMs(d: Date): number {
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  ).getTime();
}

/** Inverse of `floatingToLocalMs` — pack a local ms back into the floating-UTC space. */
function localMsToFloating(ms: number): Date {
  const d = new Date(ms);
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    ),
  );
}

/**
 * Expand a single master event into the occurrences that overlap
 * `[windowStart, windowEnd)`.
 *
 * Non-recurring events return `[master]` if they touch the window, else `[]`.
 *
 * Each returned occurrence carries:
 *   - `id`        — master id for the *first* occurrence, virtual id for the rest
 *   - `seriesId`  — always set to the master id
 *   - `start/end` — local epoch ms for this instance (duration preserved)
 *
 * The returned occurrences are sorted by `start` ascending.
 */
export function expandOccurrences(
  master: CalEvent,
  windowStart: number,
  windowEnd: number,
): CalEvent[] {
  if (windowEnd <= windowStart) return [];

  const rule = buildRRule(master);
  if (!rule) {
    // Non-recurring — keep if it overlaps the window.
    if (master.start < windowEnd && master.end > windowStart) {
      return [{ ...master, seriesId: master.id }];
    }
    return [];
  }

  const duration = master.end - master.start;

  // The `rrule` package's `between` is event-start-based. An occurrence whose
  // start is *before* windowStart can still overlap (e.g. a 90-minute meeting
  // starting 30 min before the window). Widen the lower bound by the event's
  // duration so we don't miss those.
  const lower = localMsToFloating(windowStart - duration);
  const upper = localMsToFloating(windowEnd);
  const raw = rule.between(lower, upper, true);

  const out: CalEvent[] = [];
  for (const d of raw) {
    const startMs = floatingToLocalMs(d);
    const endMs = startMs + duration;
    if (startMs >= windowEnd) continue;
    if (endMs <= windowStart) continue;
    const isFirst = startMs === master.start;
    out.push({
      ...master,
      id: isFirst ? master.id : occurrenceId(master.id, startMs),
      seriesId: master.id,
      start: startMs,
      end: endMs,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * Expand every event in the map against `[windowStart, windowEnd)`.
 * Non-recurring events are filtered for overlap; recurring ones are exploded.
 * The result is the *flat* list the renderers want to draw.
 */
export function expandAllInRange(
  events: Record<string, CalEvent>,
  windowStart: number,
  windowEnd: number,
): CalEvent[] {
  if (windowEnd <= windowStart) return [];
  const out: CalEvent[] = [];
  for (const ev of Object.values(events)) {
    if (ev.rrule && ev.rrule.trim() !== '') {
      for (const occ of expandOccurrences(ev, windowStart, windowEnd)) {
        out.push(occ);
      }
    } else if (ev.start < windowEnd && ev.end > windowStart) {
      out.push(ev);
    }
  }
  return out;
}

/** Human-friendly summary of an RRULE for the editor sidebar. */
export function describeRrule(rrule: string | undefined): string {
  if (!rrule || rrule.trim() === '') return 'Does not repeat';
  const value = rrule.replace(/^RRULE:/i, '');
  try {
    const rule = rrulestr(value);
    if (rule instanceof RRule) {
      // RRule.toText() is from `rrule` and produces "every weekday" etc.
      return rule.toText();
    }
  } catch {
    // fall through
  }
  return rrule;
}

/**
 * Common presets used by the EventEditor. The id is what we round-trip in
 * the select; the rrule is the RFC 5545 value (no `RRULE:` prefix).
 *
 * `weekday` is a deliberate choice — most of the standups in the seed are
 * Mon–Fri, so it's the most natural "weekly" option without spinning up a
 * full byday picker yet.
 */
export type RecurPreset = {
  id: 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly';
  label: string;
  rrule?: string;
};

export const RECUR_PRESETS: RecurPreset[] = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day', rrule: 'FREQ=DAILY' },
  {
    id: 'weekday',
    label: 'Every weekday (Mon–Fri)',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  },
  { id: 'weekly', label: 'Every week', rrule: 'FREQ=WEEKLY' },
  { id: 'monthly', label: 'Every month', rrule: 'FREQ=MONTHLY' },
];

/** Pick the preset id that best matches a stored rrule, for editor pre-fill. */
export function matchPreset(rrule: string | undefined): RecurPreset['id'] {
  if (!rrule || rrule.trim() === '') return 'none';
  const value = rrule.replace(/^RRULE:/i, '').toUpperCase().replace(/\s+/g, '');
  for (const p of RECUR_PRESETS) {
    if (p.rrule && p.rrule.toUpperCase().replace(/\s+/g, '') === value) {
      return p.id;
    }
  }
  // Fallback: closest by FREQ.
  if (/FREQ=DAILY/.test(value)) return 'daily';
  if (/FREQ=WEEKLY/.test(value)) {
    if (/BYDAY=MO,TU,WE,TH,FR/.test(value)) return 'weekday';
    return 'weekly';
  }
  if (/FREQ=MONTHLY/.test(value)) return 'monthly';
  return 'none';
}
