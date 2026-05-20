/**
 * Vertical-stack layout for events that overlap in time within a single day.
 * Standard column-packing: each event gets the first column whose last event
 * already ended by the new event's start.
 */
import type { CalEvent } from '../types';

export type LaidOutEvent = {
  ev: CalEvent;
  /** 0-based column index */
  col: number;
  /** number of parallel columns for this event's cluster */
  totalCols: number;
};

export function layoutDayEvents(events: CalEvent[]): LaidOutEvent[] {
  const sorted = [...events]
    .filter((e) => !e.allDay)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (sorted.length === 0) return [];

  // Cluster: contiguous group of events where any overlaps any.
  const clusters: CalEvent[][] = [];
  let current: CalEvent[] = [];
  let clusterEnd = -Infinity;

  for (const ev of sorted) {
    if (ev.start >= clusterEnd) {
      if (current.length) clusters.push(current);
      current = [ev];
      clusterEnd = ev.end;
    } else {
      current.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.end);
    }
  }
  if (current.length) clusters.push(current);

  const out: LaidOutEvent[] = [];

  for (const cluster of clusters) {
    // greedy column packing
    const colEnds: number[] = []; // last end time per column
    const assigned: { ev: CalEvent; col: number }[] = [];

    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c += 1) {
        if (colEnds[c] <= ev.start) {
          colEnds[c] = ev.end;
          assigned.push({ ev, col: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(ev.end);
        assigned.push({ ev, col: colEnds.length - 1 });
      }
    }

    const totalCols = colEnds.length;
    for (const a of assigned) {
      out.push({ ev: a.ev, col: a.col, totalCols });
    }
  }

  return out;
}
