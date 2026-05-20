import { useMemo } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { colorVar } from '../lib/colors';
import {
  addDaysMs,
  endOfDayMs,
  fmt,
  fmtTime,
  isTodayMs,
  sameDay,
  startOfDayMs,
} from '../lib/date';
import { buildAgendaSections } from '../lib/agenda';
import { useStore } from '../store/calendar';
import type { CalEvent } from '../types';

/**
 * How many days forward from the cursor we surface in the agenda.
 *
 * Long enough to feel like a real upcoming view (not "next 7 days") but
 * short enough that the list stays scannable without virtualization.
 * Beyond 60 days, paging through the cursor (j/k or ←/→) is the answer.
 */
const AGENDA_FORWARD_DAYS = 60;

type Props = {
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
};

function dayLabel(day: number, cursor: number): string {
  if (isTodayMs(day)) return 'Today';
  // Yesterday / Tomorrow are visually helpful relative anchors when the user
  // scrolls. We compute against *today*, not the cursor, so the label always
  // matches the user's wall-clock expectation.
  const today = startOfDayMs(Date.now());
  if (sameDay(day, addDaysMs(today, 1))) return 'Tomorrow';
  if (sameDay(day, addDaysMs(today, -1))) return 'Yesterday';
  // For the cursor day itself, give it a quiet "Selected" badge — useful
  // when the user paged forward with j/k and wants to see where they are.
  if (sameDay(day, cursor) && !isTodayMs(cursor)) return fmt(day, 'EEEE');
  return fmt(day, 'EEEE');
}

export function AgendaView({ onPickEvent }: Props) {
  const events = useStore((s) => s.events);
  const cursor = useStore((s) => s.cursor);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const draftId = useStore((s) => s.draftId);

  const { sections, totalEvents, windowStart, windowEnd } = useMemo(() => {
    const from = startOfDayMs(cursor);
    const through = endOfDayMs(addDaysMs(from, AGENDA_FORWARD_DAYS - 1));
    const built = buildAgendaSections(events, from, through);
    let total = 0;
    for (const s of built) total += s.events.length;
    return {
      sections: built,
      totalEvents: total,
      windowStart: from,
      windowEnd: through,
    };
  }, [events, cursor]);

  if (sections.length === 0) {
    return <EmptyState start={windowStart} end={windowEnd} />;
  }

  return (
    <div
      className="flex-1 overflow-y-auto fade-in"
      style={{ background: 'var(--bg)' }}
      role="list"
      aria-label="Agenda"
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: 720,
          padding: '20px 24px 64px',
        }}
      >
        <header
          className="flex items-baseline justify-between"
          style={{ marginBottom: 16 }}
        >
          <h2
            className="font-semibold tracking-tight"
            style={{ fontSize: 14, color: 'var(--text)' }}
          >
            Agenda
          </h2>
          <span
            className="tabular-nums"
            style={{
              fontSize: 11,
              color: 'var(--text-4)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
            }}
          >
            {totalEvents} {totalEvents === 1 ? 'event' : 'events'} ·{' '}
            {sections.length} {sections.length === 1 ? 'day' : 'days'}
          </span>
        </header>

        {sections.map((s) => (
          <DaySectionView
            key={s.day}
            day={s.day}
            cursor={cursor}
            events={s.events}
            selectedEventId={selectedEventId}
            draftId={draftId}
            onPickEvent={onPickEvent}
          />
        ))}

        <footer
          className="text-center"
          style={{
            marginTop: 32,
            fontSize: 11,
            color: 'var(--text-4)',
          }}
        >
          End of agenda — showing {AGENDA_FORWARD_DAYS} days from{' '}
          {fmt(windowStart, 'MMM d')}.
        </footer>
      </div>
    </div>
  );
}

function DaySectionView({
  day,
  cursor,
  events,
  selectedEventId,
  draftId,
  onPickEvent,
}: {
  day: number;
  cursor: number;
  events: CalEvent[];
  selectedEventId: string | null;
  draftId: string | null;
  onPickEvent: (ev: CalEvent, anchor: { x: number; y: number }) => void;
}) {
  const today = isTodayMs(day);
  const label = dayLabel(day, cursor);
  const date = fmt(day, 'EEE, MMM d');

  return (
    <section
      role="group"
      aria-label={date}
      style={{ marginBottom: 22 }}
    >
      <div
        className="flex items-baseline gap-3"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 6,
          marginBottom: 8,
        }}
      >
        <span
          className="tabular-nums"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 28,
            height: 24,
            padding: today ? 0 : '0 8px',
            borderRadius: 9999,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            fontWeight: 600,
            background: today ? 'var(--accent)' : 'var(--bg-surface)',
            color: today ? '#ffffff' : 'var(--text-2)',
            boxShadow: today ? 'none' : 'inset 0 0 0 1px var(--border-subtle)',
          }}
        >
          {fmt(day, 'd')}
        </span>
        <span
          className="font-semibold tracking-tight"
          style={{
            fontSize: 12.5,
            color: today ? 'var(--text)' : 'var(--text-2)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11.5,
            color: 'var(--text-3)',
          }}
        >
          {label === date ? '' : date}
        </span>
        <span style={{ flex: 1 }} />
        <span
          className="tabular-nums"
          style={{
            fontSize: 10.5,
            color: 'var(--text-4)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {events.length}
        </span>
      </div>

      <ul
        className="flex flex-col"
        style={{ gap: 4, listStyle: 'none', padding: 0, margin: 0 }}
      >
        {events.map((ev) => (
          <EventRow
            key={`${day}-${ev.id}`}
            ev={ev}
            day={day}
            selected={selectedEventId === ev.id || draftId === ev.id}
            onPick={onPickEvent}
          />
        ))}
      </ul>
    </section>
  );
}

function EventRow({
  ev,
  day,
  selected,
  onPick,
}: {
  ev: CalEvent;
  day: number;
  selected: boolean;
  onPick: (ev: CalEvent, anchor: { x: number; y: number }) => void;
}) {
  const isAllDay = ev.allDay === true;
  const startsThisDay = sameDay(ev.start, day);
  const endsThisDay = sameDay(ev.end, day);
  const isMultiDay = !startsThisDay || !endsThisDay;

  let timeLabel: string;
  if (isAllDay) {
    timeLabel = 'All day';
  } else if (isMultiDay) {
    if (!startsThisDay && !endsThisDay) timeLabel = 'All day · continues';
    else if (!startsThisDay) timeLabel = `until ${fmtTime(ev.end)}`;
    else timeLabel = `from ${fmtTime(ev.start)}`;
  } else {
    timeLabel = `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`;
  }

  return (
    <li role="listitem">
      <button
        type="button"
        data-event-id={ev.id}
        onClick={(e) => {
          e.stopPropagation();
          onPick(ev, { x: e.clientX, y: e.clientY });
        }}
        className="w-full text-left flex items-center"
        style={{
          gap: 12,
          padding: '8px 10px',
          borderRadius: 6,
          background: selected ? 'var(--accent-soft-2)' : 'var(--bg-surface)',
          boxShadow: selected
            ? '0 0 0 1px var(--accent-2)'
            : 'inset 0 0 0 1px var(--border-subtle)',
          color: 'var(--text)',
          transition: 'background var(--transition), box-shadow var(--transition)',
          cursor: 'pointer',
        }}
        title={ev.title || '(untitled)'}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 3,
            height: 22,
            borderRadius: 2,
            background: colorVar(ev.color),
            flexShrink: 0,
          }}
        />
        <span
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-3)',
            minWidth: 110,
            letterSpacing: '-0.005em',
          }}
        >
          {timeLabel}
        </span>
        <span
          className="truncate"
          style={{
            fontSize: 12.5,
            fontWeight: 510,
            flex: 1,
            color: ev.title ? 'var(--text)' : 'var(--text-3)',
          }}
        >
          {ev.title || '(untitled)'}
        </span>
        {ev.location && (
          <span
            className="truncate"
            style={{
              fontSize: 11.5,
              color: 'var(--text-3)',
              maxWidth: 180,
            }}
          >
            {ev.location}
          </span>
        )}
        {isMultiDay && !isAllDay && (
          <span
            aria-label="Multi-day event"
            title="Multi-day event"
            style={{
              color: 'var(--text-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            ↦
          </span>
        )}
      </button>
    </li>
  );
}

function EmptyState({ start, end }: { start: number; end: number }) {
  return (
    <div
      className="flex-1 grid place-items-center fade-in"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="text-center"
        style={{ maxWidth: 360, padding: 24 }}
      >
        <div
          className="mx-auto"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: 'var(--accent-soft)',
            color: 'var(--accent-2)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: 12,
            border: '1px solid var(--border-subtle)',
          }}
          aria-hidden="true"
        >
          <CalendarBlank weight="duotone" size={18} />
        </div>
        <div
          className="font-semibold tracking-tight"
          style={{ fontSize: 13.5, color: 'var(--text)', marginBottom: 4 }}
        >
          No upcoming events
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Nothing scheduled from {fmt(start, 'MMM d')} through{' '}
          {fmt(end, 'MMM d')}. Press <span className="kbd">N</span> to create one.
        </div>
      </div>
    </div>
  );
}
