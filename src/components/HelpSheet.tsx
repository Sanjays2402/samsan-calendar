import { Keyboard, X } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { useStore } from '../store/calendar';

/**
 * Shortcut cheatsheet — Linear-style.
 *
 * Triggered by `?` (or via the command palette). Renders a centered modal
 * grouping every keyboard shortcut Hotkeys.tsx binds, plus the Cmd-K / ⌘Z /
 * ⌘E commands the palette exposes. Single source of truth: when you add a
 * shortcut to Hotkeys.tsx, add a row here.
 *
 * Closes on Escape (handled in Hotkeys), on backdrop click, or on the close
 * button. Mouse-only users can still find every shortcut via Cmd-K — this
 * sheet is the "what can I press?" answer for the keyboard-first user.
 */
type Row = { keys: string[]; label: string };

type Group = {
  title: string;
  rows: Row[];
};

const GROUPS: Group[] = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['/'], label: 'Quick open (palette)' },
      { keys: ['?'], label: 'Show this sheet' },
      { keys: ['Esc'], label: 'Close palette / sheet / editor' },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { keys: ['T'], label: 'Jump to today' },
      { keys: ['J'], label: 'Forward (1 day / 1 week)' },
      { keys: ['K'], label: 'Backward (1 day / 1 week)' },
      { keys: ['→'], label: 'Forward 1 day' },
      { keys: ['←'], label: 'Backward 1 day' },
      { keys: ['↓'], label: 'Forward (week in month, day elsewhere)' },
      { keys: ['↑'], label: 'Backward (week in month, day elsewhere)' },
    ],
  },
  {
    title: 'Views',
    rows: [
      { keys: ['M'], label: 'Month view' },
      { keys: ['W'], label: 'Week view' },
      { keys: ['D'], label: 'Day view' },
      { keys: ['A'], label: 'Agenda view' },
    ],
  },
  {
    title: 'Events',
    rows: [
      { keys: ['N'], label: 'New event at cursor' },
      { keys: ['↵'], label: 'Open / edit focused event' },
      { keys: ['⌫'], label: 'Delete selected event' },
    ],
  },
  {
    title: 'History',
    rows: [
      { keys: ['⌘', 'Z'], label: 'Undo' },
      { keys: ['⇧', '⌘', 'Z'], label: 'Redo' },
      { keys: ['⌘', 'Y'], label: 'Redo (Windows)' },
    ],
  },
  {
    title: 'Export',
    rows: [{ keys: ['⌘', 'E'], label: 'Export all events to .ics' }],
  },
];

export function HelpSheet() {
  const open = useStore((s) => s.helpOpen);
  const close = useStore((s) => s.closeHelp);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus close button when the sheet opens so screen readers + keyboard users
  // land somewhere predictable. We don't trap focus — Esc closes the sheet
  // and palette/sheet are mutually exclusive, so a full focus trap is overkill.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center fade-in"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div
        className="rise-in"
        style={{
          width: 'min(720px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          overflow: 'auto',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-overlay)',
        }}
        onKeyDown={(e) => {
          // Stop bubbling so global Hotkeys don't fire while the sheet is open.
          // Esc and `?` are intentionally still handled at the window level —
          // they close the sheet — so we only swallow other keys.
          if (e.key !== 'Escape' && e.key !== '?') e.stopPropagation();
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={16} weight="duotone" style={{ color: 'var(--accent)' }} />
            <h2
              id="help-title"
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.1 }}
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn btn-icon"
            onClick={close}
            aria-label="Close shortcuts"
            style={{ width: 28, height: 28 }}
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
            padding: 20,
          }}
        >
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  color: 'var(--text-3)',
                  marginBottom: 8,
                }}
              >
                {g.title}
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {g.rows.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between"
                    style={{
                      padding: '6px 0',
                      fontSize: 13,
                      color: 'var(--text)',
                      borderTop:
                        i === 0 ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    <span>{r.label}</span>
                    <span className="flex items-center gap-1">
                      {r.keys.map((k, ki) => (
                        <span key={ki} className="kbd">
                          {k}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            color: 'var(--text-3)',
            fontSize: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            Type <span className="kbd">?</span> from anywhere to open this sheet.
          </span>
          <span>
            <span className="kbd">Esc</span> to close
          </span>
        </div>
      </div>
    </div>
  );
}
