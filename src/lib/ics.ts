import type { CalEvent, EventColor } from '../types';

/**
 * .ics exporter — RFC 5545 minimal subset.
 *
 * What we emit:
 * - VCALENDAR / VEVENT envelope
 * - UID, DTSTAMP, DTSTART, DTEND, SUMMARY, optional LOCATION + DESCRIPTION
 * - All-day events use VALUE=DATE form with DTSTART and DTEND (exclusive)
 *
 * What we deliberately don't bother with:
 * - VTIMEZONE blocks (we emit floating local times for timed events; most
 *   calendar clients interpret these correctly when imported on the same
 *   machine. A future improvement could embed VTIMEZONE.)
 * - Per-occurrence exceptions (EXDATE/detached instances) — masters export
 *   their RRULE; expanded occurrences are deduped, never re-emitted.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc5545
 */

const CRLF = '\r\n';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYYMMDD in local time (for all-day events). */
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** YYYYMMDDTHHMMSS in local "floating" time. */
function fmtLocal(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

/** YYYYMMDDTHHMMSSZ — UTC stamp, used for DTSTAMP. */
function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Escape per RFC 5545 §3.3.11 TEXT */
function escText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Fold long content lines per §3.1 (75 octets, continuation = space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    out.push((i === 0 ? '' : ' ') + chunk);
    i += i === 0 ? 75 : 74;
  }
  return out.join(CRLF);
}

function eventToVEvent(ev: CalEvent, stamp: number): string {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${ev.id}@samsan-calendar`);
  lines.push(`DTSTAMP:${fmtUtc(stamp)}`);
  if (ev.allDay) {
    // RFC 5545 §3.6.1: DATE form; DTEND is exclusive end-day.
    // Our model stores end-of-day-inclusive (dayEnd - 1ms), so DTEND = end + 1ms,
    // rounded to the next day boundary.
    const endDayPlus = new Date(ev.end);
    // Bump into the next calendar day if it isn't already.
    endDayPlus.setDate(endDayPlus.getDate() + 1);
    endDayPlus.setHours(0, 0, 0, 0);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(endDayPlus.getTime())}`);
  } else {
    lines.push(`DTSTART:${fmtLocal(ev.start)}`);
    lines.push(`DTEND:${fmtLocal(ev.end)}`);
  }
  lines.push(`SUMMARY:${escText(ev.title || '(untitled)')}`);
  if (ev.location) lines.push(`LOCATION:${escText(ev.location)}`);
  if (ev.notes) lines.push(`DESCRIPTION:${escText(ev.notes)}`);
  lines.push(`CATEGORIES:${ev.color}`);
  if (ev.rrule && ev.rrule.trim() !== '') {
    // Strip any accidental "RRULE:" prefix the caller might have included
    // and emit one canonical RRULE line. RFC 5545 §3.8.5.3.
    const value = ev.rrule.replace(/^RRULE:/i, '').trim();
    lines.push(`RRULE:${value}`);
  }
  lines.push('END:VEVENT');
  return lines.map(fold).join(CRLF);
}

/** Produce the full .ics text for a set of events. */
export function eventsToIcs(events: CalEvent[]): string {
  const stamp = Date.now();
  const blocks: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Samsan//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  // Only emit the *master* of a recurring series — never its expanded
  // occurrences (which would produce duplicate VEVENTs in the .ics). We
  // detect them by the virtual-id suffix or by the presence of a `seriesId`
  // that differs from the event's own id.
  for (const ev of events) {
    if (ev.seriesId && ev.seriesId !== ev.id) continue;
    blocks.push(eventToVEvent(ev, stamp));
  }
  blocks.push('END:VCALENDAR');
  return blocks.join(CRLF) + CRLF;
}

/** Trigger a browser download of an .ics file containing the given events. */
export function downloadIcs(events: CalEvent[], filename = 'samsan-calendar.ics'): void {
  if (typeof window === 'undefined') return;
  const text = eventsToIcs(events);
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so Safari has a moment to dispatch the download.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------------------------------------------ */
/* Import                                                               */
/* ------------------------------------------------------------------ */

/**
 * .ics importer — parses a useful subset of RFC 5545 into CalEvent objects.
 *
 * Understood per VEVENT: UID, DTSTART, DTEND, SUMMARY, LOCATION,
 * DESCRIPTION, CATEGORIES (mapped back to our event colors), and RRULE —
 * but only the simple FREQ=DAILY|WEEKLY|MONTHLY series we can expand;
 * fancier rules import as single events. Lines are unfolded per §3.1 and
 * TEXT values unescaped per §3.3.11. TZID parameters are not honored (we
 * treat such times as floating local, same as our own export).
 *
 * Ids: events we exported carry `UID:<id>@samsan-calendar`; those ids are
 * restored verbatim, so re-importing one of our own exports is idempotent
 * (upsert by id, no duplicates). Foreign UIDs are namespaced to `ics-…` so
 * they can neither collide with local ids nor be mistaken for virtual
 * occurrence ids (`__<ms>`).
 */

type PropBag = Record<string, { value: string; params: string }>;

/** Unfold RFC 5545 content lines (a line starting with space/tab continues the previous). */
function unfoldLines(text: string): string[] {
  const raw = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if (
      out.length > 0 &&
      (line.startsWith(' ') || line.startsWith('\t'))
    ) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Reverse of escText (note: escape order in escText does `\` first, so we undo it last). */
function unescText(s: string): string {
  return s
    .replace(/\\[nN]/g, '\n')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\');
}

/** Parse DATE / DATE-TIME values (floating, UTC `Z`, or VALUE=DATE). Null when unparsable. */
function parseDateValue(
  value: string,
  params: string,
): { ms: number; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly =
    /;VALUE=DATE(?:;|$)/i.test(params + ';') ||
    (!v.includes('T') && /^\d{8}$/.test(v));
  if (dateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (!m) return null;
    const ms = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
    ).getTime();
    return { ms, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(
    Number,
  );
  const ms =
    m[7] === 'Z'
      ? Date.UTC(y, mo - 1, d, h, mi, s)
      : new Date(y, mo - 1, d, h, mi, s).getTime();
  return { ms, allDay: false };
}

const OWN_UID_SUFFIX = '@samsan-calendar';

function importId(rawUid: string | undefined): string {
  if (!rawUid) {
    return `ics-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
  const raw = rawUid.trim();
  if (raw.endsWith(OWN_UID_SUFFIX)) {
    return raw.slice(0, -OWN_UID_SUFFIX.length);
  }
  const safe =
    raw
      .replace(/__/g, '--')
      .replace(/[^A-Za-z0-9._~-]/g, '-')
      .slice(0, 80) || 'untitled';
  return `ics-${safe}`;
}

/** Keep only the simple recurring series we can expand; anything fancier becomes a single event. */
function importRrule(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.replace(/^RRULE:/i, '').trim();
  return /^FREQ=(DAILY|WEEKLY|MONTHLY)(;|$)/i.test(value) ? value : undefined;
}

const EVENT_COLORS: readonly EventColor[] = [
  'indigo',
  'emerald',
  'amber',
  'rose',
  'sky',
  'violet',
];

function veventToEvent(bag: PropBag): CalEvent | null {
  const s = bag['DTSTART'];
  if (!s) return null;
  const start = parseDateValue(s.value, s.params);
  if (!start || Number.isNaN(start.ms)) return null;

  let endMs: number;
  let allDay = start.allDay;
  const e = bag['DTEND'];
  if (e) {
    const end = parseDateValue(e.value, e.params);
    if (!end || Number.isNaN(end.ms)) return null;
    // Our all-day `end` is inclusive end-of-day; the ics DTEND is exclusive.
    endMs = end.allDay ? end.ms - 1 : end.ms;
    allDay = start.allDay && end.allDay;
  } else if (start.allDay) {
    // Single all-day event: inclusive end-of-day.
    endMs = start.ms + 24 * 60 * 60 * 1000 - 1;
  } else {
    // No DTEND — default to a one-hour event.
    endMs = start.ms + 60 * 60 * 1000;
  }
  if (endMs < start.ms) endMs = start.ms;

  const ev: CalEvent = {
    id: importId(bag['UID']?.value),
    title: (bag['SUMMARY'] ? unescText(bag['SUMMARY'].value) : '').trim() || '(untitled)',
    start: start.ms,
    end: endMs,
    allDay,
    color: 'indigo',
    updatedAt: Date.now(),
  };
  const cat = bag['CATEGORIES']?.value.trim().toLowerCase();
  if (cat && (EVENT_COLORS as readonly string[]).includes(cat)) {
    ev.color = cat as EventColor;
  }
  const loc = bag['LOCATION']?.value;
  if (loc && unescText(loc).trim() !== '') ev.location = unescText(loc).trim();
  const desc = bag['DESCRIPTION']?.value;
  if (desc && unescText(desc).trim() !== '') ev.notes = unescText(desc).trim();
  const rrule = importRrule(bag['RRULE']?.value);
  if (rrule) ev.rrule = rrule;
  return ev;
}

/** Parse an .ics document into calendar events. Returns [] for unparseable input — never throws. */
export function parseIcs(text: string): CalEvent[] {
  const events: CalEvent[] = [];
  let bag: PropBag | null = null;
  for (const line of unfoldLines(text)) {
    if (line === 'BEGIN:VEVENT') {
      bag = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (bag) {
        const ev = veventToEvent(bag);
        if (ev) events.push(ev);
      }
      bag = null;
      continue;
    }
    if (!bag) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const semi = head.indexOf(';');
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
    const params = semi < 0 ? '' : head.slice(semi);
    // Keep the first occurrence of each property.
    if (!(name in bag)) bag[name] = { value, params };
  }
  return events;
}
