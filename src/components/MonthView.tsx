import { ArrowsClockwise } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { colorVar } from '../lib/colors';
import {
  endOfDayMs,
  fmt,
  isTodayMs,
  monthMatrix,
  sameDay,
  sameMonth,
  startOfDayMs,
} from '../lib/date';
import { expandAllInRange } from '../lib/recur';
import { uid } from '../lib/uid';
import { useStore } from '../store/calendar';
import type { CalEvent } from '../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
};

export function MonthView({ onPickEvent }: Props) {
  const events = useStore((s) => s.events);
  const cursor = useStore((s) => s.cursor);
  const setView = useStore((s) => s.setView);
  const setCursor = useStore((s) => s.setCursor);
  const createEvent = useStore((s) => s.createEvent);
  const patchEventLocal = useStore((s) => s.patchEventLocal);
  const commitEvent = useStore((s) => s.commitEvent);
  const setDraft = useStore((s) => s.setDraft);
  const draftId = useStore((s) => s.draftId);
  const selectedEventId = useStore((s) => s.selectedEventId);

  const matrix = useMemo(() => monthMatrix(cursor), [cursor]);

  // Bucket events per day.
  //
  // Recurring masters are expanded against the visible month matrix *once*
  // via `expandAllInRange`; the resulting flat array already contains every
  // virtual occurrence (with stable `<masterId>__<ms>` ids) and every
  // one-off event that touches the window. We then bucket per-day from that
  // flat list — same shape as before, just sourced from the expansion layer.
  const byDay = useMemo(() => {
    const map = new Map<number, CalEvent[]>();
    const windowStart = startOfDayMs(matrix[0]![0]!);
    const windowEnd = endOfDayMs(matrix[matrix.length - 1]![6]!);
    const flat = expandAllInRange(events, windowStart, windowEnd).sort(
      (a, b) => a.start - b.start || a.end - b.end,
    );
    for (const row of matrix) {
      for (const day of row) {
        const dayStart = startOfDayMs(day);
        const dayEnd = endOfDayMs(day);
        map.set(
          day,
          flat.filter((e) => e.start < dayEnd && e.end > dayStart),
        );
      }
    }
    return map;
  }, [events, matrix]);

  // ---- drag-to-reschedule (by day) ---------------------------------------
  //
  // Tracking the target day via `onPointerEnter` on each cell does NOT work
  // once we `setPointerCapture` on the chip (capture suppresses delivery to
  // any other element). Earlier versions of MonthView captured on the chip
  // and counted on pointerenter — which silently never fired.
  //
  // New design: capture on the grid root, attach a single `onPointerMove`
  // there, and use `document.elementFromPoint(x, y)` to find the day cell
  // under the cursor. Cells are tagged with `data-day-ms="<ms>"` for cheap
  // lookups. This matches how TimeGrid handles the same problem.
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    eventId: string;
    durationMs: number;
    grabDay: number; // day cell where pointer started
    currentDay: number;
    prev: CalEvent;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function startDrag(e: React.PointerEvent, ev: CalEvent, day: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // Capture on the grid root so onPointerMove keeps firing even if the
    // pointer leaves the chip's box.
    gridRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      eventId: ev.id,
      durationMs: ev.end - ev.start,
      grabDay: day,
      currentDay: day,
      prev: ev,
    };
    setDraggingId(ev.id);
  }

  function cellDayMsFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = (el as HTMLElement).closest<HTMLElement>('[data-day-ms]');
    if (!cell) return null;
    const ms = Number(cell.dataset.dayMs);
    return Number.isFinite(ms) ? ms : null;
  }

  function onGridPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const day = cellDayMsFromPoint(e.clientX, e.clientY);
    if (day == null || day === d.currentDay) return;
    const ev = useStore.getState().events[d.eventId];
    if (!ev) return;
    const delta = day - d.grabDay;
    const newStart = d.prev.start + delta;
    const newEnd = newStart + d.durationMs;
    patchEventLocal(d.eventId, { start: newStart, end: newEnd });
    dragRef.current = { ...d, currentDay: day };
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    gridRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    const current = useStore.getState().events[d.eventId];
    if (current && (current.start !== d.prev.start || current.end !== d.prev.end)) {
      void commitEvent(d.eventId, d.prev, 'Move event');
    }
    dragRef.current = null;
    setDraggingId(null);
  }

  function quickCreateOnDay(day: number, anchor: { x: number; y: number }) {
    // Default: 10:00 → 11:00 on that day
    const start = startOfDayMs(day) + 10 * 60 * 60 * 1000;
    const end = start + 60 * 60 * 1000;
    const id = uid();
    const ev: CalEvent = {
      id,
      title: '',
      start,
      end,
      color: 'indigo',
      updatedAt: Date.now(),
    };
    void createEvent(ev).then(() => {
      setDraft(id);
      onPickEvent(ev, anchor);
    });
  }

  function jumpToDay(day: number) {
    setCursor(day);
    setView('day');
  }

  return (
    <div
      className="flex-1 flex flex-col fade-in"
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* weekday header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center"
            style={{
              padding: '8px 0',
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              borderLeft: '1px solid var(--border-subtle)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6 × 7 cells */}
      <div
        ref={gridRef}
        className="flex-1 grid"
        style={{
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
          background: 'var(--bg)',
          touchAction: 'none',
        }}
        onPointerMove={onGridPointerMove}
      >
        {matrix.flatMap((row, rowIdx) =>
          row.map((day, colIdx) => {
            const inMonth = sameMonth(day, cursor);
            const today = isTodayMs(day);
            const dayEvents = byDay.get(day) ?? [];
            const visible = dayEvents.slice(0, 3);
            const overflow = dayEvents.length - visible.length;
            return (
              <DayCell
                key={day}
                day={day}
                inMonth={inMonth}
                today={today}
                topRow={rowIdx === 0}
                leftCol={colIdx === 0}
                onCellClick={(anchor) => quickCreateOnDay(day, anchor)}
                onCellDoubleClick={() => jumpToDay(day)}
              >
                <div className="flex items-center justify-between px-1.5 pt-1.5">
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: today
                        ? '#ffffff'
                        : inMonth
                          ? 'var(--text-2)'
                          : 'var(--text-4)',
                      background: today ? 'var(--accent)' : 'transparent',
                      borderRadius: 9999,
                      width: today ? 20 : 'auto',
                      height: today ? 20 : 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: today ? 0 : '0 4px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {fmt(day, 'd')}
                  </span>
                  {dayEvents.length > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-4)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {dayEvents.length}
                    </span>
                  )}
                </div>
                <div className="px-1 pb-1 flex flex-col gap-[2px] mt-0.5">
                  {visible.map((ev) => {
                    const isSelected =
                      selectedEventId === ev.id || draftId === ev.id;
                    const isDragging = draggingId === ev.id;
                    const cross = !sameDay(ev.start, ev.end);
                    return (
                      <div
                        key={ev.id}
                        data-event-id={ev.id}
                        data-selected={isSelected || undefined}
                        data-dragging={isDragging || undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={ev.title || 'Untitled event'}
                        className="event-chip truncate"
                        onPointerDown={(e) => startDrag(e, ev, day)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onPickEvent(ev, {
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
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
                        style={{
                          fontSize: 11,
                          fontWeight: 510,
                          lineHeight: '16px',
                          padding: '1px 5px',
                          color: 'var(--text)',
                          borderLeft: `2px solid ${colorVar(ev.color)}`,
                        }}
                        title={ev.title || '(untitled)'}
                      >
                        {cross && (
                          <span
                            style={{
                              color: 'var(--text-4)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              marginRight: 4,
                            }}
                          >
                            ↦
                          </span>
                        )}
                        <span
                          style={{
                            color: 'var(--text-3)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            marginRight: 4,
                          }}
                        >
                          {fmt(ev.start, 'h:mm')}
                        </span>
                        {(ev.rrule || ev.seriesId) && (
                          <ArrowsClockwise
                            size={9}
                            weight="bold"
                            aria-label="Recurring event"
                            style={{
                              display: 'inline-block',
                              marginRight: 3,
                              color: 'var(--text-4)',
                              verticalAlign: '-1px',
                            }}
                          />
                        )}
                        {ev.title || (
                          <span style={{ color: 'var(--text-3)' }}>
                            (untitled)
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToDay(day);
                      }}
                      style={{
                        fontSize: 10.5,
                        padding: '0 5px',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                      }}
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </DayCell>
            );
          }),
        )}
      </div>
    </div>
  );
}

function DayCell({
  day,
  inMonth,
  today,
  topRow,
  leftCol,
  onCellClick,
  onCellDoubleClick,
  children,
}: {
  day: number;
  inMonth: boolean;
  today: boolean;
  topRow: boolean;
  leftCol: boolean;
  onCellClick: (anchor: { x: number; y: number }) => void;
  onCellDoubleClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-event-id]')) return;
        onCellClick({ x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={onCellDoubleClick}
      className="relative overflow-hidden"
      data-day-ms={day}
      style={{
        borderTop: topRow ? 'none' : '1px solid var(--border-subtle)',
        borderLeft: leftCol ? 'none' : '1px solid var(--border-subtle)',
        background: hover
          ? inMonth
            ? 'var(--hover)'
            : 'transparent'
          : inMonth
            ? 'transparent'
            : 'var(--bg-panel)',
        opacity: inMonth ? 1 : 0.6,
        cursor: 'cell',
        transition: 'background var(--transition)',
      }}
      aria-label={fmt(day, 'EEEE, MMM d')}
      role="button"
      tabIndex={-1}
      data-today={today || undefined}
    >
      {children}
    </div>
  );
}
