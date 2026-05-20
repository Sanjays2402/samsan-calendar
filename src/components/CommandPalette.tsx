import {
  ArrowUUpLeft,
  ArrowUUpRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  House,
  Keyboard,
  MagnifyingGlass,
  MoonStars,
  Plus,
  Sun,
  Target,
} from '@phosphor-icons/react';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  addDaysMs,
  addMinutesMs,
  fmt,
  snapToMinutes,
  startOfDayMs,
  todayMs,
} from '../lib/date';
import { fuzzyMatch, highlightChunks } from '../lib/fuzzy';
import { downloadIcs } from '../lib/ics';
import { parseNlDate } from '../lib/nl-date';
import { uid } from '../lib/uid';
import { withViewTransition } from '../lib/view-transition';
import { useStore } from '../store/calendar';
import type { CalEvent, ViewMode } from '../types';

type Section = 'create' | 'navigate' | 'view' | 'theme' | 'export' | 'history' | 'events' | 'jump' | 'help';

const SECTION_LABEL: Record<Section, string> = {
  create: 'Create',
  navigate: 'Navigate',
  view: 'View',
  theme: 'Theme',
  export: 'Export',
  history: 'History',
  jump: 'Jump to',
  events: 'Events',
  help: 'Help',
};

type ActionItem = {
  kind: 'action';
  id: string;
  label: string;
  /** Searched alongside label so e.g. `swdv` finds "Switch to day view". */
  searchHaystack?: string;
  hint?: string;
  icon: ComponentType<{ size?: number; weight?: 'regular' | 'bold' | 'duotone' }>;
  shortcut?: string;
  section: Section;
  run: () => void | Promise<void>;
};

type EventItem = {
  kind: 'event';
  id: string;
  event: CalEvent;
  section: 'events';
  run: () => void | Promise<void>;
};

type JumpItem = {
  kind: 'jump';
  id: string;
  label: string;
  hint?: string;
  section: 'jump';
  icon: ComponentType<{ size?: number; weight?: 'regular' | 'bold' | 'duotone' }>;
  run: () => void | Promise<void>;
};

type Item = ActionItem | EventItem | JumpItem;

const THEME_CYCLE: Record<string, string> = {
  system: 'dark',
  dark: 'light',
  light: 'system',
};

function buildEventHaystack(ev: CalEvent): string {
  return [ev.title || 'Untitled', ev.location ?? '', ev.notes ?? '']
    .filter(Boolean)
    .join(' · ');
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const close = useStore((s) => s.closePalette);
  const events = useStore((s) => s.events);
  const cursor = useStore((s) => s.cursor);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setCursor = useStore((s) => s.setCursor);
  const goToday = useStore((s) => s.goToday);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const createEvent = useStore((s) => s.createEvent);
  const setDraft = useStore((s) => s.setDraft);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const openHelp = useStore((s) => s.openHelp);

  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset query + focus when the palette opens. We focus on the next tick so
  // the input element exists and the browser doesn't swallow the focus call.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const allActions = useMemo<ActionItem[]>(() => {
    return [
      {
        kind: 'action',
        id: 'new',
        label: 'New event',
        searchHaystack: 'create new event add',
        hint: 'create a 1-hour event at the cursor day',
        icon: Plus,
        shortcut: 'N',
        section: 'create',
        run: () => {
          const todayStart = startOfDayMs(todayMs());
          const cursorDay = startOfDayMs(cursor);
          const offset = cursorDay - todayStart;
          const baseStart = snapToMinutes(addMinutesMs(Date.now(), 15), 30);
          const start = baseStart + offset;
          const end = addMinutesMs(start, 60);
          const id = uid();
          void createEvent({
            id,
            title: '',
            start,
            end,
            color: 'indigo',
            updatedAt: Date.now(),
          });
          setDraft(id);
        },
      },
      {
        kind: 'action',
        id: 'today',
        label: 'Go to today',
        icon: House,
        shortcut: 'T',
        section: 'navigate',
        run: () => withViewTransition(goToday),
      },
      ...(['day', 'week', 'month', 'agenda'] as ViewMode[]).map<ActionItem>((v) => ({
        kind: 'action',
        id: `view-${v}`,
        label: `Switch to ${v} view`,
        icon: CalendarBlank,
        shortcut: v[0]!.toUpperCase(),
        section: 'view',
        run: () => setView(v),
      })),
      {
        kind: 'action',
        id: 'next',
        label:
          view === 'day'
            ? 'Next day'
            : view === 'week'
              ? 'Next week'
              : view === 'agenda'
                ? 'Next page'
                : 'Next month',
        icon: CaretRight,
        shortcut: '→',
        section: 'navigate',
        run: () => {
          const step =
            view === 'day' ? 1 : view === 'week' ? 7 : view === 'agenda' ? 30 : 30;
          withViewTransition(() => setCursor(addDaysMs(cursor, step)));
        },
      },
      {
        kind: 'action',
        id: 'prev',
        label:
          view === 'day'
            ? 'Previous day'
            : view === 'week'
              ? 'Previous week'
              : view === 'agenda'
                ? 'Previous page'
                : 'Previous month',
        icon: CaretLeft,
        shortcut: '←',
        section: 'navigate',
        run: () => {
          const step =
            view === 'day' ? 1 : view === 'week' ? 7 : view === 'agenda' ? 30 : 30;
          withViewTransition(() => setCursor(addDaysMs(cursor, -step)));
        },
      },
      {
        kind: 'action',
        id: 'theme',
        label: `Theme: ${theme} → ${THEME_CYCLE[theme] ?? 'system'}`,
        searchHaystack: 'theme dark light system toggle appearance',
        icon: theme === 'light' ? Sun : MoonStars,
        section: 'theme',
        run: () => setTheme((THEME_CYCLE[theme] ?? 'system') as typeof theme),
      },
      {
        kind: 'action',
        id: 'export',
        label: 'Export all events to .ics',
        searchHaystack: 'export download ics calendar file',
        hint: 'download a standards-compliant calendar file',
        icon: DownloadSimple,
        shortcut: '⌘E',
        section: 'export',
        run: () => {
          const all = Object.values(events).sort((a, b) => a.start - b.start);
          if (all.length === 0) return;
          downloadIcs(
            all,
            `samsan-calendar-${fmt(Date.now(), 'yyyy-MM-dd')}.ics`,
          );
        },
      },
      {
        kind: 'action',
        id: 'undo',
        label: 'Undo last action',
        icon: ArrowUUpLeft,
        shortcut: '⌘Z',
        section: 'history',
        run: () => void undo(),
      },
      {
        kind: 'action',
        id: 'redo',
        label: 'Redo last action',
        icon: ArrowUUpRight,
        shortcut: '⇧⌘Z',
        section: 'history',
        run: () => void redo(),
      },
      {
        kind: 'action',
        id: 'help',
        label: 'Keyboard shortcuts',
        searchHaystack: 'help shortcuts keyboard cheatsheet ?',
        hint: 'show the keyboard shortcut sheet',
        icon: Keyboard,
        shortcut: '?',
        section: 'help',
        run: () => openHelp(),
      },
    ];
  }, [
    cursor,
    view,
    theme,
    events,
    createEvent,
    setDraft,
    setView,
    setCursor,
    setTheme,
    goToday,
    undo,
    redo,
    openHelp,
  ]);

  // Sections render in this order when the query is empty.
  const SECTION_ORDER: Section[] = [
    'jump',
    'create',
    'navigate',
    'view',
    'theme',
    'export',
    'history',
    'help',
    'events',
  ];

  const ranked = useMemo<Array<{ item: Item; matches?: number[] }>>(() => {
    const query = q.trim();

    // ----- Empty query: show all actions + nearest events -----------------
    if (!query) {
      const now = Date.now();
      const upcoming = Object.values(events)
        .filter((e) => e.end >= now)
        .sort((a, b) => a.start - b.start)
        .slice(0, 6);
      const out: Array<{ item: Item; matches?: number[] }> = allActions.map(
        (a) => ({ item: a }),
      );
      for (const event of upcoming) {
        out.push({
          item: {
            kind: 'event',
            id: event.id,
            event,
            section: 'events',
            run: () => {
              setCursor(startOfDayMs(event.start));
              setDraft(event.id);
              close();
            },
          },
        });
      }
      return out;
    }

    // ----- Fuzzy match actions --------------------------------------------
    const scored: Array<{ item: Item; score: number; matches: number[] }> = [];
    for (const a of allActions) {
      const labelHit = fuzzyMatch(query, a.label);
      const haystackHit = a.searchHaystack
        ? fuzzyMatch(query, a.searchHaystack)
        : null;
      const hit = labelHit && (!haystackHit || labelHit.score >= haystackHit.score)
        ? labelHit
        : haystackHit;
      if (!hit || hit.score <= 0) continue;
      const matchesOnLabel = labelHit && labelHit.score > 0 ? labelHit.matches : [];
      scored.push({ item: a, score: hit.score, matches: matchesOnLabel });
    }

    // ----- Fuzzy match events ---------------------------------------------
    for (const event of Object.values(events)) {
      const labelText = event.title || 'Untitled';
      const haystack = buildEventHaystack(event);
      const labelHit = fuzzyMatch(query, labelText);
      const haystackHit = fuzzyMatch(query, haystack);
      const hit = labelHit && (!haystackHit || labelHit.score >= haystackHit.score)
        ? labelHit
        : haystackHit;
      if (!hit || hit.score <= 0) continue;
      const matchesOnLabel = labelHit && labelHit.score > 0 ? labelHit.matches : [];
      scored.push({
        item: {
          kind: 'event',
          id: event.id,
          event,
          section: 'events',
          run: () => {
            setCursor(startOfDayMs(event.start));
            setDraft(event.id);
            close();
          },
        },
        score: hit.score,
        matches: matchesOnLabel,
      });
    }

    // ----- "Jump to <date>" — only when the input parses as a date --------
    const parsed = parseNlDate(query);
    if (parsed) {
      scored.push({
        item: {
          kind: 'jump',
          id: `jump-${parsed.date.getTime()}`,
          label: `Jump to ${parsed.label}`,
          hint: fmt(parsed.date.getTime(), 'yyyy-MM-dd'),
          icon: Target,
          section: 'jump',
          run: () => {
            withViewTransition(() => setCursor(parsed.date.getTime()));
          },
        },
        // Score above almost everything so the user's clear intent wins.
        score: 200 + parsed.confidence,
        matches: [],
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
      .map(({ item, matches }) => ({ item, matches }));
  }, [q, allActions, events, setCursor, setDraft, close]);

  // Keep `active` in range when ranked changes.
  useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, ranked.length - 1)));
  }, [ranked.length]);

  // Scroll active item into view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  function activate(item: Item) {
    void Promise.resolve(item.run()).then(() => {
      // Most actions should close on activation. Theme is the noisy exception;
      // we still close it because the cycled-to value is visible in the label.
      close();
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, ranked.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = ranked[active];
      if (entry) activate(entry.item);
    }
    // Esc handled at window level by Hotkeys.
  }

  // Group results by section in the empty-query case. For non-empty queries
  // we show flat ranked results (so the top hit is always row 0, which is
  // what people expect after they start typing).
  const showSectionHeaders = q.trim() === '';
  const grouped: Array<{ section: Section; items: typeof ranked }> = (() => {
    if (!showSectionHeaders) return [];
    const bySection = new Map<Section, typeof ranked>();
    for (const entry of ranked) {
      const sec = entry.item.section as Section;
      const arr = bySection.get(sec) ?? [];
      arr.push(entry);
      bySection.set(sec, arr);
    }
    const out: Array<{ section: Section; items: typeof ranked }> = [];
    for (const sec of SECTION_ORDER) {
      const items = bySection.get(sec);
      if (items && items.length > 0) out.push({ section: sec, items });
    }
    return out;
  })();

  // Compute the flat index used for keyboard navigation. When section headers
  // are visible we still want `active` to skip the headers — so we keep a
  // single counter and tag each rendered button with its `data-idx`.
  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center pt-[12vh] fade-in"
      style={{
        background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
        backdropFilter: 'blur(8px) saturate(140%)',
        WebkitBackdropFilter: 'blur(8px) saturate(140%)',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-[min(620px,92vw)] rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-overlay)',
        }}
      >
        <div
          className="flex items-center gap-2 px-3"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            height: 44,
          }}
        >
          <MagnifyingGlass
            size={14}
            weight="bold"
            style={{ color: 'var(--text-3)' }}
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Type a command, jump to a date, or search events…"
            className="flex-1 bg-transparent outline-none"
            style={{
              fontSize: 13,
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="kbd">esc</span>
        </div>

        <div
          ref={listRef}
          className="max-h-[52vh] overflow-auto"
          style={{ padding: 4 }}
          role="listbox"
          aria-label="Command results"
        >
          {ranked.length === 0 && (
            <div
              className="px-3 py-6 text-center"
              style={{ color: 'var(--text-3)', fontSize: 12.5 }}
            >
              No matches
            </div>
          )}

          {showSectionHeaders
            ? grouped.map(({ section, items }) => (
                <Fragment key={section}>
                  <div
                    className="px-2.5 pt-2 pb-1 uppercase tracking-wider"
                    style={{ color: 'var(--text-4)', fontSize: 10.5, fontWeight: 600 }}
                  >
                    {SECTION_LABEL[section]}
                  </div>
                  {items.map((entry) => {
                    flatIdx += 1;
                    return (
                      <Row
                        key={`${section}-${entry.item.id}`}
                        idx={flatIdx}
                        entry={entry}
                        active={flatIdx === active}
                        onHover={setActive}
                        onActivate={activate}
                      />
                    );
                  })}
                </Fragment>
              ))
            : ranked.map((entry, idx) => (
                <Row
                  key={entry.item.id}
                  idx={idx}
                  entry={entry}
                  active={idx === active}
                  onHover={setActive}
                  onActivate={activate}
                />
              ))}
        </div>

        <div
          className="flex items-center justify-between px-3"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            height: 30,
            color: 'var(--text-4)',
            fontSize: 11,
          }}
        >
          <span className="flex items-center gap-2">
            <span className="kbd">↑↓</span> navigate
            <span className="kbd">↵</span> select
          </span>
          <span className="flex items-center gap-2">
            <span className="kbd">⌘K</span> toggle
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- Row -------------------------------------------------------------------

type RowProps = {
  idx: number;
  entry: { item: Item; matches?: number[] };
  active: boolean;
  onHover: (i: number) => void;
  onActivate: (item: Item) => void;
};

function Row({ idx, entry, active, onHover, onActivate }: RowProps) {
  const { item, matches = [] } = entry;
  const baseStyle = {
    padding: '7px 10px',
    fontSize: 13,
    borderRadius: 6,
    // Active row: a denser accent fill + 3px inset accent bar — strong enough
    // to read as "selected" from across the dialog, not a hover artifact. Tuned
    // directly here (not via --accent-soft) so the palette's selection state
    // is louder than the calendar's "selected event" tint.
    background: active
      ? 'color-mix(in oklab, var(--accent-2) 16%, transparent)'
      : 'transparent',
    boxShadow: active ? 'inset 3px 0 0 var(--accent-2)' : 'none',
    color: 'var(--text)',
    transition:
      'background var(--transition), box-shadow var(--transition), transform var(--transition)',
  } as const;

  if (item.kind === 'action' || item.kind === 'jump') {
    const Icon = item.icon;
    return (
      <button
        data-idx={idx}
        type="button"
        role="option"
        aria-selected={active}
        onMouseEnter={() => onHover(idx)}
        onClick={() => onActivate(item)}
        className="flex items-center gap-2.5 w-full text-left"
        style={baseStyle}
      >
        <span
          className="grid place-items-center w-6 h-6 rounded-md shrink-0"
          style={{
            background: active ? 'var(--accent-soft-2)' : 'var(--bg-surface)',
            color: active ? 'var(--accent-2)' : 'var(--text-2)',
            border: active
              ? '1px solid color-mix(in oklab, var(--accent-2) 38%, transparent)'
              : '1px solid var(--border-subtle)',
            transition: 'background var(--transition), color var(--transition), border-color var(--transition)',
          }}
        >
          <Icon size={13} weight="duotone" />
        </span>
        <span className="flex-1 min-w-0 truncate">
          <Highlighted text={item.label} matches={matches} />
        </span>
        {'hint' in item && item.hint && (
          <span
            className="hidden sm:inline truncate"
            style={{ color: 'var(--text-4)', fontSize: 11.5 }}
          >
            {item.hint}
          </span>
        )}
        {'shortcut' in item && item.shortcut && (
          <span className="kbd">{item.shortcut}</span>
        )}
      </button>
    );
  }

  const ev = item.event;
  return (
    <button
      data-idx={idx}
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={() => onHover(idx)}
      onClick={() => onActivate(item)}
      className="flex items-center gap-2.5 w-full text-left"
      style={baseStyle}
    >
      <span
        className="inline-block rounded-sm shrink-0"
        style={{
          width: 8,
          height: 8,
          background: `var(--evt-${ev.color})`,
        }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 truncate">
        {ev.title ? (
          <Highlighted text={ev.title} matches={matches} />
        ) : (
          <span style={{ color: 'var(--text-3)' }}>(untitled)</span>
        )}
      </span>
      <span
        className="tabular-nums hidden sm:inline"
        style={{
          color: 'var(--text-3)',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {ev.allDay
          ? fmt(ev.start, "EEE, MMM d · 'all-day'")
          : fmt(ev.start, "EEE, MMM d · h:mm a")}
      </span>
    </button>
  );
}

function Highlighted({ text, matches }: { text: string; matches: number[] }) {
  if (matches.length === 0) return <>{text}</>;
  const chunks = highlightChunks(text, matches);
  return (
    <>
      {chunks.map((chunk, i) =>
        chunk.matched ? (
          <span
            key={i}
            style={{
              color: 'var(--accent)',
              fontWeight: 600,
            }}
          >
            {chunk.text}
          </span>
        ) : (
          <span key={i}>{chunk.text}</span>
        ),
      )}
    </>
  );
}
