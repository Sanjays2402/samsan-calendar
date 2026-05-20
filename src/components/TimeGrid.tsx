import { ArrowsClockwise } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { colorSoftVar, colorVar } from '../lib/colors';
import {
  addMinutesMs,
  endOfDayMs,
  fmtTime,
  fmtTimeMono,
  HOURS,
  floorToMinutes,
  isTodayMs,
  fmt,
  sameDay,
  snapToMinutes,
  startOfDayMs,
  weekDays,
} from '../lib/date';
import { layoutDayEvents } from '../lib/layout';
import { expandAllInRange } from '../lib/recur';
import { uid } from '../lib/uid';
import { useStore } from '../store/calendar';
import type { CalEvent } from '../types';

const SLOT_HEIGHT = 48; // px per hour
const SNAP_MIN = 15;
const PX_PER_MIN = SLOT_HEIGHT / 60;
const MIN_EVENT_MIN = 15;

type Props = {
  days: number[]; // day timestamps (midnight) — length 1 for day-view, 7 for week
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
};

type DragKind =
  | { kind: 'idle' }
  | {
      kind: 'create';
      anchorMs: number;
      dayCapMs: number;
      currentStart: number;
      currentEnd: number;
      pickedCol: number;
    }
  | {
      kind: 'move';
      eventId: string;
      grabOffsetMin: number;
      durationMin: number;
      prev: CalEvent;
    }
  | { kind: 'resize'; eventId: string; minStartMs: number; prev: CalEvent };

export function TimeGrid({ days, onPickEvent }: Props) {
  const events = useStore((s) => s.events);
  const createEvent = useStore((s) => s.createEvent);
  const patchEventLocal = useStore((s) => s.patchEventLocal);
  const commitEvent = useStore((s) => s.commitEvent);
  const setDraft = useStore((s) => s.setDraft);
  const draftId = useStore((s) => s.draftId);
  const selectedEventId = useStore((s) => s.selectedEventId);

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragKind>({ kind: 'idle' });
  const dragRef = useRef<DragKind>(drag);
  dragRef.current = drag;

  // ---- now-line ---------------------------------------------------------
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ---- scroll to a reasonable hour on first paint ------------------------
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = SLOT_HEIGHT * 7.5;
  }, []);

  // ---- per-day layout ----------------------------------------------------
  //
  // Recurring masters are expanded against the full visible window (day or
  // week) via `expandAllInRange`, then bucketed back per-day. This keeps the
  // existing collision-layout shape intact — TimeGrid still sees an array of
  // `CalEvent` per day — while making every occurrence of a weekly series
  // appear on its rightful weekday.
  const perDay = useMemo(() => {
    const map = new Map<number, ReturnType<typeof layoutDayEvents>>();
    const windowStart = startOfDayMs(days[0]!);
    const windowEnd = endOfDayMs(days[days.length - 1]!);
    const flat = expandAllInRange(events, windowStart, windowEnd);
    for (const day of days) {
      const dayStart = startOfDayMs(day);
      const dayEnd = endOfDayMs(day);
      const inDay = flat.filter(
        (e) => e.start < dayEnd && e.end > dayStart && !e.allDay,
      );
      map.set(day, layoutDayEvents(inDay));
    }
    return map;
  }, [events, days]);

  // ---- pointer helpers ---------------------------------------------------
  function pointerToCell(clientX: number, clientY: number): {
    dayMs: number;
    ms: number;
    colIdx: number;
  } | null {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const colWidth = rect.width / days.length;
    const xRel = clientX - rect.left;
    const yRel = clientY - rect.top;
    if (yRel < 0) return null;
    const colIdx = Math.max(
      0,
      Math.min(days.length - 1, Math.floor(xRel / colWidth)),
    );
    const dayMs = days[colIdx];
    const minOfDay = Math.max(
      0,
      Math.min(24 * 60, Math.round(yRel / PX_PER_MIN)),
    );
    const ms = startOfDayMs(dayMs) + minOfDay * 60_000;
    return { dayMs, ms, colIdx };
  }

  // ---- drag handlers -----------------------------------------------------
  function onGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-event-id]')) return;
    const pos = pointerToCell(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const anchorMs = floorToMinutes(pos.ms, SNAP_MIN);
    setDrag({
      kind: 'create',
      anchorMs,
      dayCapMs: endOfDayMs(anchorMs),
      currentStart: anchorMs,
      currentEnd: addMinutesMs(anchorMs, 30),
      pickedCol: pos.colIdx,
    });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (d.kind === 'idle') return;
    const pos = pointerToCell(e.clientX, e.clientY);
    if (!pos) return;

    if (d.kind === 'create') {
      const cur = floorToMinutes(pos.ms, SNAP_MIN);
      const start = Math.min(d.anchorMs, cur);
      let end = Math.max(addMinutesMs(d.anchorMs, SNAP_MIN), cur);
      if (end > d.dayCapMs) end = d.dayCapMs;
      setDrag({ ...d, currentStart: start, currentEnd: end });
      return;
    }

    if (d.kind === 'move') {
      const dayStart = startOfDayMs(pos.dayMs);
      const minOfDay = Math.round((pos.ms - dayStart) / 60_000);
      const snappedTop = snapToMinutes(
        dayStart + (minOfDay - d.grabOffsetMin) * 60_000,
        SNAP_MIN,
      );
      const newStart = Math.max(dayStart, snappedTop);
      const dayEnd = endOfDayMs(pos.dayMs);
      const clampedStart = Math.min(newStart, dayEnd - d.durationMin * 60_000);
      const newEnd = clampedStart + d.durationMin * 60_000;
      patchEventLocal(d.eventId, { start: clampedStart, end: newEnd });
      return;
    }

    if (d.kind === 'resize') {
      const snapped = snapToMinutes(pos.ms, SNAP_MIN);
      const minEnd = addMinutesMs(d.minStartMs, MIN_EVENT_MIN);
      const dayCap = endOfDayMs(d.minStartMs);
      const end = Math.max(minEnd, Math.min(snapped, dayCap));
      patchEventLocal(d.eventId, { end });
      return;
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (d.kind === 'idle') return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (d.kind === 'create') {
      const id = uid();
      const ev: CalEvent = {
        id,
        title: '',
        start: d.currentStart,
        end: d.currentEnd,
        color: 'indigo',
        updatedAt: Date.now(),
      };
      void createEvent(ev).then(() => {
        setDraft(id);
        onPickEvent(ev, {
          x: e.clientX,
          y: Math.min(window.innerHeight - 320, e.clientY),
        });
      });
    } else if (d.kind === 'move' || d.kind === 'resize') {
      void commitEvent(
        d.eventId,
        d.prev,
        d.kind === 'move' ? 'Move event' : 'Resize event',
      );
    }
    setDrag({ kind: 'idle' });
  }

  function startMove(e: React.PointerEvent<HTMLDivElement>, ev: CalEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = pointerToCell(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault();
    (gridRef.current as HTMLElement).setPointerCapture(e.pointerId);
    const grabOffsetMin = Math.round((pos.ms - ev.start) / 60_000);
    const durationMin = Math.max(
      MIN_EVENT_MIN,
      Math.round((ev.end - ev.start) / 60_000),
    );
    setDrag({
      kind: 'move',
      eventId: ev.id,
      grabOffsetMin,
      durationMin,
      prev: ev,
    });
  }

  function startResize(
    e: React.PointerEvent<HTMLDivElement>,
    ev: CalEvent,
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (gridRef.current as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      kind: 'resize',
      eventId: ev.id,
      minStartMs: ev.start,
      prev: ev,
    });
  }

  function clickEvent(e: React.MouseEvent, ev: CalEvent) {
    e.stopPropagation();
    onPickEvent(ev, { x: e.clientX, y: e.clientY });
  }

  // ---- render ----------------------------------------------------------
  const isDay = days.length === 1;
  const gridTemplateColumns = `64px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto fade-in"
      style={{ background: 'var(--bg)' }}
    >
      {/* day header row */}
      <div
        className="sticky top-0 z-30 grid"
        style={{
          gridTemplateColumns,
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div />
        {days.map((d) => {
          const today = isTodayMs(d);
          return (
            <div
              key={d}
              className="flex flex-col items-center justify-center"
              style={{
                padding: '8px 0 10px',
                borderLeft: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: today ? 'var(--accent-2)' : 'var(--text-3)',
                  fontWeight: 600,
                }}
              >
                {fmt(d, isDay ? 'EEEE' : 'EEE')}
              </span>
              <span
                className="mt-0.5 tabular-nums"
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: today ? 'var(--accent-2)' : 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {fmt(d, 'd')}
              </span>
            </div>
          );
        })}
      </div>

      {/* time + grid */}
      <div
        className="grid relative"
        style={{
          gridTemplateColumns,
          minHeight: SLOT_HEIGHT * 24,
        }}
      >
        {/* hour gutter */}
        <div
          style={{
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg)',
          }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="relative"
              style={{
                height: SLOT_HEIGHT,
                borderTop: h === 0 ? 'none' : '1px solid var(--border-subtle)',
              }}
            >
              {h > 0 && (
                <span
                  className="absolute right-2 -top-2 tabular-nums"
                  style={{
                    color: 'var(--text-3)',
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {fmtTimeMono(startOfDayMs(0) + h * 3600 * 1000)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* day columns */}
        <div
          ref={gridRef}
          data-testid="time-grid"
          className="col-span-full relative"
          style={{
            gridColumnStart: 2,
            gridColumnEnd: days.length + 2,
            display: 'grid',
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            touchAction: 'none',
          }}
          onPointerDown={onGridPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {days.map((d, dayIdx) => {
            const today = isTodayMs(d);
            const laid = perDay.get(d) ?? [];
            const dayStartMs = startOfDayMs(d);
            return (
              <div
                key={d}
                className="relative"
                style={{
                  borderLeft:
                    dayIdx === 0 ? 'none' : '1px solid var(--border-subtle)',
                  background: today ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                {/* hour grid lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{
                      position: 'absolute',
                      top: h * SLOT_HEIGHT,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: 'var(--border-subtle)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {/* now line */}
                {sameDay(d, nowMs) && (
                  <NowLine nowMs={nowMs} dayStartMs={dayStartMs} />
                )}

                {/* events */}
                {laid.map(({ ev, col, totalCols }) => {
                  const startMin = Math.max(
                    0,
                    Math.round((ev.start - dayStartMs) / 60_000),
                  );
                  const endMin = Math.min(
                    24 * 60,
                    Math.round((ev.end - dayStartMs) / 60_000),
                  );
                  const top = startMin * PX_PER_MIN;
                  const height = Math.max(
                    18,
                    (endMin - startMin) * PX_PER_MIN - 2,
                  );
                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;
                  const isSelected =
                    selectedEventId === ev.id || draftId === ev.id;
                  const isDragging =
                    (drag.kind === 'move' || drag.kind === 'resize') &&
                    drag.eventId === ev.id;
                  const tight = height < 36;
                  return (
                    <div
                      key={ev.id}
                      data-event-id={ev.id}
                      data-selected={isSelected || undefined}
                      data-dragging={isDragging || undefined}
                      role="button"
                      tabIndex={0}
                      aria-label={ev.title || 'Untitled event'}
                      className="event-tile absolute"
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: colorSoftVar(ev.color),
                        borderLeft: `2px solid ${colorVar(ev.color)}`,
                        padding: tight ? '1px 6px' : '4px 8px',
                        color: 'var(--text)',
                        zIndex: isDragging ? 14 : isSelected ? 12 : 8,
                      }}
                      onPointerDown={(e) => startMove(e, ev)}
                      onClick={(e) => clickEvent(e, ev)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const r = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          onPickEvent(ev, {
                            x: r.left + r.width / 2,
                            y: r.top + r.height / 2,
                          });
                        }
                      }}
                    >
                      <div
                        className="truncate"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: '-0.005em',
                          lineHeight: '15px',
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        {(ev.rrule || ev.seriesId) && (
                          <ArrowsClockwise
                            size={10}
                            weight="bold"
                            aria-label="Recurring event"
                            style={{
                              flexShrink: 0,
                              color: 'var(--text-3)',
                            }}
                          />
                        )}
                        <span className="truncate">
                          {ev.title || (
                            <span style={{ color: 'var(--text-3)' }}>
                              (untitled)
                            </span>
                          )}
                        </span>
                      </div>
                      {!tight && (
                        <div
                          className="truncate tabular-nums"
                          style={{
                            fontSize: 11,
                            // a11y: --text-3 (#8a8f98) fails WCAG 4.5:1 on
                            // amber/rose-soft event chips. --text-2 (#d0d6e0
                            // in dark; #2a2c30 in light) clears 7:1 on every
                            // event-soft background. SAM-68.
                            color: 'var(--text-2)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {fmtTime(ev.start)} – {fmtTime(ev.end)}
                        </div>
                      )}
                      <div
                        onPointerDown={(e) => startResize(e, ev)}
                        className="absolute left-1 right-1"
                        style={{
                          bottom: 0,
                          height: 6,
                          cursor: 'ns-resize',
                          background: 'transparent',
                        }}
                        aria-label="Resize"
                        role="separator"
                        aria-orientation="horizontal"
                      />
                    </div>
                  );
                })}

                {/* drag-create ghost (only in the column we started in) */}
                {drag.kind === 'create' && dayIdx === drag.pickedCol && (
                  <CreateGhost
                    startMs={drag.currentStart}
                    endMs={drag.currentEnd}
                    dayStartMs={dayStartMs}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateGhost({
  startMs,
  endMs,
  dayStartMs,
}: {
  startMs: number;
  endMs: number;
  dayStartMs: number;
}) {
  const startMin = Math.max(0, Math.round((startMs - dayStartMs) / 60_000));
  const endMin = Math.min(
    24 * 60,
    Math.round((endMs - dayStartMs) / 60_000),
  );
  const top = startMin * PX_PER_MIN;
  const height = Math.max(18, (endMin - startMin) * PX_PER_MIN - 2);
  return (
    <div
      className="create-ghost absolute pointer-events-none"
      style={{
        top,
        height,
        left: 2,
        right: 2,
        background: 'var(--evt-indigo-soft)',
        borderLeft: '2px solid var(--evt-indigo)',
        borderRadius: 6,
        zIndex: 15,
        padding: '2px 6px',
        color: 'var(--text)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {fmtTime(startMs)} – {fmtTime(endMs)}
    </div>
  );
}

function NowLine({ nowMs, dayStartMs }: { nowMs: number; dayStartMs: number }) {
  const min = Math.max(0, Math.min(24 * 60, (nowMs - dayStartMs) / 60_000));
  const top = min * PX_PER_MIN;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        zIndex: 5,
        pointerEvents: 'none',
      }}
      aria-label="Now"
      role="img"
    >
      <div
        className="now-dot"
        style={{
          position: 'absolute',
          left: -4,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: 'var(--accent-2)',
        }}
      />
      <div
        style={{
          height: 1.5,
          background: 'var(--accent-2)',
          opacity: 0.95,
        }}
      />
    </div>
  );
}

export function WeekView({
  onPickEvent,
}: {
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
}) {
  const cursor = useStore((s) => s.cursor);
  const days = useMemo(() => weekDays(cursor), [cursor]);
  return <TimeGrid days={days} onPickEvent={onPickEvent} />;
}

export function DayView({
  onPickEvent,
}: {
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
}) {
  const cursor = useStore((s) => s.cursor);
  const days = useMemo(() => [startOfDayMs(cursor)], [cursor]);
  return <TimeGrid days={days} onPickEvent={onPickEvent} />;
}
