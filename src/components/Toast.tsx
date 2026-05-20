import { ArrowUUpLeft, X } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useStore } from '../store/calendar';

const TOAST_DURATION_MS = 4500;

/**
 * Tiny bottom-center toast for undo confirmations. One at a time —
 * the store overwrites the previous toast when something new happens.
 *
 * If the toast is from an undoable action (`undoId === 'last'`), clicking
 * the Undo button (or pressing ⌘Z, handled in Hotkeys) reverses it.
 */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const undo = useStore((s) => s.undo);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;

  return (
    <div
      className="fixed left-1/2 z-40 pointer-events-none"
      style={{
        bottom: 24,
        transform: 'translateX(-50%)',
      }}
      aria-live="polite"
    >
      <div
        className="flex items-center gap-2 fade-in pointer-events-auto"
        style={{
          padding: '7px 8px 7px 12px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-overlay)',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <span>{toast.label}</span>
        {toast.undoId === 'last' && (
          <button
            type="button"
            className="btn"
            style={{ height: 26, padding: '0 8px', fontSize: 12 }}
            onClick={() => {
              void undo();
              setToast(null);
            }}
            title="Undo (⌘Z)"
          >
            <ArrowUUpLeft size={12} weight="bold" />
            Undo
            <span className="kbd ml-0.5">⌘Z</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => setToast(null)}
          aria-label="Dismiss"
          style={{ width: 24, height: 24 }}
        >
          <X size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}
