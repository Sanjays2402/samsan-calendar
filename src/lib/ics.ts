import type { CalEvent } from '../types';

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
 * - RRULE/EXDATE/recurrence (we don't have recurring events yet)
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
