import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  MoonStars,
  Plus,
  Sun,
} from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useStore } from '../store/calendar';
import {
  addDaysMs,
  addMinutesMs,
  fmt,
  snapToMinutes,
  startOfDayMs,
  startOfMonthMs,
  startOfWeekMs,
  todayMs,
} from '../lib/date';
import { uid } from '../lib/uid';
import { withViewTransition } from '../lib/view-transition';
import type { Theme, ViewMode } from '../types';

const VIEW_LABEL: Record<ViewMode, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
};

/**
 * Agenda view pages forward in 30-day chunks. The list is dense, scrolls
 * inside its own pane, and j/k still nudge the cursor by a single day — but
 * the top-bar arrows feel useless if they only shift the window by 1 day,
 * so we use the same step as month nav.
 */
const AGENDA_STEP_DAYS = 30;

function navStep(view: ViewMode): (ms: number, dir: 1 | -1) => number {
  if (view === 'day') return (ms, dir) => addDaysMs(ms, dir);
  if (view === 'week') return (ms, dir) => addDaysMs(ms, 7 * dir);
  if (view === 'agenda') return (ms, dir) => addDaysMs(ms, AGENDA_STEP_DAYS * dir);
  return (ms, dir) => {
    const d = new Date(ms);
    d.setDate(1);
    d.setMonth(d.getMonth() + dir);
    return startOfMonthMs(d.getTime());
  };
}

function headerTitle(view: ViewMode, cursor: number): string {
  if (view === 'day') return fmt(cursor, 'EEEE, MMM d');
  if (view === 'week') {
    const start = startOfWeekMs(cursor);
    const end = addDaysMs(start, 6);
    const sameMonth = fmt(start, 'MMM') === fmt(end, 'MMM');
    if (sameMonth) {
      return `${fmt(start, 'MMM d')} – ${fmt(end, 'd, yyyy')}`;
    }
    return `${fmt(start, 'MMM d')} – ${fmt(end, 'MMM d, yyyy')}`;
  }
  if (view === 'agenda') {
    // Agenda shows a 60-day forward window; the header reads as the
    // anchor date with a quiet "upcoming" suffix. Range syntax felt heavy
    // for what is conceptually "from <date> onward".
    const start = startOfDayMs(cursor);
    return `${fmt(start, 'MMM d, yyyy')} · upcoming`;
  }
  return fmt(cursor, 'MMMM yyyy');
}

const THEME_ORDER: Theme[] = ['system', 'dark', 'light'];

export function TopBar() {
  const view = useStore((s) => s.view);
  const cursor = useStore((s) => s.cursor);
  const setView = useStore((s) => s.setView);
  const setCursor = useStore((s) => s.setCursor);
  const goToday = useStore((s) => s.goToday);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const setDraft = useStore((s) => s.setDraft);
  const openPalette = useStore((s) => s.openPalette);

  const step = useMemo(() => navStep(view), [view]);
  const title = useMemo(() => headerTitle(view, cursor), [view, cursor]);

  function go(dir: 1 | -1) {
    withViewTransition(() => setCursor(step(cursor, dir)));
  }

  function pickView(v: ViewMode) {
    if (v === view) return;
    // Important: we do NOT wrap this in withViewTransition. The view swap
    // replaces the entire canvas (TimeGrid ↔ MonthView ↔ AgendaView), so
    // there is no visual continuity for the UA snapshot to interpolate. The
    // 180ms ::view-transition window installs top-layer pseudos that
    // occlude hit-testing (elementFromPoint returns <html>, pointerdown
    // routes nowhere) — and a user often clicks a chip immediately after
    // switching views. Pay the snapshot cost only where it earns its keep:
    // same-view cursor navigation (`go()` above). The `.fade-in` class on
    // each view root handles the entrance.
    setView(v);
  }

  function nextTheme() {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }

  function quickNew() {
    const todayStart = startOfDayMs(todayMs());
    const cursorDay = startOfDayMs(cursor);
    const offset = cursorDay - todayStart;
    const baseStart = snapToMinutes(addMinutesMs(Date.now(), 15), 30);
    const start = baseStart + offset;
    const end = addMinutesMs(start, 60);
    const id = uid();
    void upsertEvent({
      id,
      title: '',
      start,
      end,
      color: 'indigo',
      updatedAt: Date.now(),
    });
    setDraft(id);
  }

  const themeIcon =
    theme === 'light' ? (
      <Sun weight="duotone" size={14} />
    ) : theme === 'dark' ? (
      <MoonStars weight="duotone" size={14} />
    ) : (
      <CalendarBlank weight="duotone" size={14} />
    );

  return (
    <header
      className="flex items-center gap-3 px-3 h-12 border-b shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-panel)' }}
    >
      <div className="flex items-center gap-2 pr-2">
        <div
          className="w-6 h-6 rounded-md grid place-items-center"
          style={{
            background: 'var(--accent-soft)',
            color: 'var(--accent-2)',
            border: '1px solid var(--border-subtle)',
          }}
          aria-hidden="true"
        >
          <CalendarBlank weight="duotone" size={14} />
        </div>
        <span
          className="font-semibold tracking-tight"
          style={{ fontSize: 13, color: 'var(--text)' }}
        >
          Samsan
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Calendar</span>
      </div>

      <button
        type="button"
        className="btn"
        onClick={() => withViewTransition(goToday)}
        aria-label="Go to today (t)"
      >
        Today
      </button>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => go(-1)}
          aria-label="Previous"
        >
          <CaretLeft weight="bold" size={14} />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => go(1)}
          aria-label="Next"
        >
          <CaretRight weight="bold" size={14} />
        </button>
      </div>

      <h1
        className="flex-1 text-center font-semibold tracking-tight tabular-nums"
        style={{ fontSize: 13.5, color: 'var(--text)' }}
      >
        {title}
      </h1>

      <div className="seg" role="tablist" aria-label="View">
        {(['day', 'week', 'month', 'agenda'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            // role="tab" requires aria-selected, not aria-pressed.
            // axe aria-allowed-attr was failing on this. (SAM-68)
            aria-selected={view === v}
            tabIndex={view === v ? 0 : -1}
            onClick={() => pickView(v)}
            title={`${VIEW_LABEL[v]} (${v[0]})`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn"
        onClick={openPalette}
        title="Command palette (⌘K)"
      >
        <span style={{ color: 'var(--text-3)' }}>Search</span>
        <span className="kbd ml-1">⌘K</span>
      </button>

      <button
        type="button"
        className="btn btn-icon"
        onClick={nextTheme}
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme} (click to cycle)`}
      >
        {themeIcon}
      </button>

      <button
        type="button"
        className="btn btn-primary"
        onClick={quickNew}
        aria-label="New event (n)"
      >
        <Plus weight="bold" size={13} />
        <span>New</span>
      </button>
    </header>
  );
}
