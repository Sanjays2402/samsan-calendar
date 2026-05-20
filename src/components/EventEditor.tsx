import { ArrowsClockwise, CaretDown, Trash, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EVENT_COLORS, colorVar } from '../lib/colors';
import { addMinutesMs, diffMinutes, fmt } from '../lib/date';
import {
  RECUR_PRESETS,
  type RecurPreset,
  describeRrule,
  matchPreset,
} from '../lib/recur';
import { useStore } from '../store/calendar';
import type { CalEvent, EventColor } from '../types';

type Props = {
  event: CalEvent;
  anchor: { x: number; y: number };
  onClose: () => void;
};

function toLocalDateInput(ms: number): string {
  return fmt(ms, "yyyy-MM-dd'T'HH:mm");
}

function fromLocalDateInput(v: string): number | null {
  // The <input type="datetime-local"> emits a string in local time.
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

const POP_WIDTH = 320;
// Bumped to account for the recurrence row (SAM-70). The editor is taller
// now, so we want clampPos to give it more breathing room from viewport edges.
const POP_HEIGHT_GUESS = 380;

export function EventEditor({ event, anchor, onClose }: Props) {
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const setDraft = useStore((s) => s.setDraft);

  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(event.start);
  const [end, setEnd] = useState(event.end);
  const [color, setColor] = useState<EventColor>(event.color);
  const [notes, setNotes] = useState(event.notes ?? '');
  /**
   * `rrule` is held as the RFC 5545 *value* (no `RRULE:` prefix) or `''`
   * for one-off events. We keep it in local state so the preview text
   * updates instantly; the store is only written on Save.
   */
  const [rrule, setRrule] = useState<string>(event.rrule ?? '');
  const [presetId, setPresetId] = useState<RecurPreset['id']>(() =>
    matchPreset(event.rrule),
  );
  /** Toggle for the "Custom RRULE" advanced field. Hidden by default. */
  const [showCustom, setShowCustom] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  // re-hydrate when the bound event id changes
  useEffect(() => {
    setTitle(event.title);
    setStart(event.start);
    setEnd(event.end);
    setColor(event.color);
    setNotes(event.notes ?? '');
    setRrule(event.rrule ?? '');
    setPresetId(matchPreset(event.rrule));
    setShowCustom(false);
  }, [event.id, event.title, event.start, event.end, event.color, event.notes, event.rrule]);

  useEffect(() => {
    const t = window.setTimeout(() => titleRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [event.id]);

  const pos = useMemo(() => clampPos(anchor.x, anchor.y), [anchor.x, anchor.y]);

  async function commitAndClose() {
    // Trim & normalize rrule: empty string means "does not repeat" and is
    // persisted as `undefined` so we don't write a no-op field to IDB.
    const trimmedRrule = rrule.trim().replace(/^RRULE:/i, '');
    const next: CalEvent = {
      ...event,
      title: title.trim(),
      start,
      end: end > start ? end : addMinutesMs(start, 30),
      color,
      notes: notes.trim() || undefined,
      rrule: trimmedRrule === '' ? undefined : trimmedRrule,
      updatedAt: Date.now(),
    };
    await updateEvent(next);
    setDraft(null);
    onClose();
  }

  async function discardEmptyAndClose() {
    if (event.title.trim() === '' && title.trim() === '') {
      await deleteEvent(event.id);
    } else {
      await commitAndClose();
      return;
    }
    setDraft(null);
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void commitAndClose();
    }
  }

  const minutes = Math.max(15, diffMinutes(end, start));

  return (
    <>
      <button
        type="button"
        aria-label="Close editor"
        onClick={() => void discardEmptyAndClose()}
        className="fixed inset-0"
        style={{ background: 'transparent', zIndex: 60 }}
      />
      <div
        role="dialog"
        aria-label="Edit event"
        className="fixed surface rounded-xl fade-in"
        style={{
          left: pos.x,
          top: pos.y,
          width: POP_WIDTH,
          zIndex: 70,
          background: 'var(--bg-panel)',
          boxShadow: 'var(--shadow-overlay)',
          padding: 12,
        }}
        onKeyDown={onKey}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: colorVar(color) }}
            aria-hidden="true"
          />
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: 'var(--text)',
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          />
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => void discardEmptyAndClose()}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X weight="bold" size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Starts">
            <input
              type="datetime-local"
              value={toLocalDateInput(start)}
              onChange={(e) => {
                const next = fromLocalDateInput(e.target.value);
                if (next === null) return;
                const delta = next - start;
                setStart(next);
                setEnd((end ?? next) + delta);
              }}
              className="dt-input"
            />
          </Field>
          <Field label="Ends">
            <input
              type="datetime-local"
              value={toLocalDateInput(end)}
              onChange={(e) => {
                const next = fromLocalDateInput(e.target.value);
                if (next === null) return;
                setEnd(next);
              }}
              className="dt-input"
            />
          </Field>
        </div>

        <div
          className="mb-2"
          style={{ color: 'var(--text-3)', fontSize: 11.5 }}
        >
          {minutes} min
        </div>

        <div className="flex items-center gap-1 mb-3">
          {EVENT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.id)}
              aria-label={c.label}
              title={c.label}
              className="w-5 h-5 rounded-full grid place-items-center"
              style={{
                background: colorVar(c.id),
                boxShadow:
                  color === c.id
                    ? '0 0 0 2px var(--bg-panel), 0 0 0 3.5px var(--accent-2)'
                    : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                transition: 'box-shadow var(--transition)',
              }}
            />
          ))}
        </div>

        {/*
          Recurrence picker (SAM-70).

          v1 is series-level: editing a recurring event edits the whole
          series. Presets emit RFC 5545 RRULE values; choosing "Does not
          repeat" clears the field. The "Custom" toggle exposes the raw
          rrule string so power users / tests can paste BYDAY etc. without
          us shipping a full byday picker (future SAM-72).
        */}
        <div className="mb-3">
          <div
            style={{
              color: 'var(--text-3)',
              fontSize: 11,
              fontWeight: 510,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <ArrowsClockwise size={10} weight="bold" aria-hidden="true" />
            Repeats
          </div>
          <div className="relative">
            <select
              value={presetId}
              onChange={(e) => {
                const id = e.target.value as RecurPreset['id'];
                const preset = RECUR_PRESETS.find((p) => p.id === id);
                setPresetId(id);
                setRrule(preset?.rrule ?? '');
                // Hide the custom field when the user picks a clean preset.
                setShowCustom(false);
              }}
              className="dt-input"
              style={{ appearance: 'none', paddingRight: 24 }}
              aria-label="Recurrence preset"
            >
              {RECUR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <CaretDown
              size={10}
              weight="bold"
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Inline description + custom toggle */}
          <div
            className="flex items-center justify-between mt-1"
            style={{ fontSize: 11 }}
          >
            <span style={{ color: 'var(--text-3)' }}>
              {describeRrule(rrule || undefined)}
            </span>
            <button
              type="button"
              onClick={() => setShowCustom((v) => !v)}
              style={{
                color: 'var(--text-4)',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
              aria-expanded={showCustom}
            >
              {showCustom ? 'Hide custom' : 'Custom RRULE'}
            </button>
          </div>

          {showCustom && (
            <input
              type="text"
              value={rrule}
              onChange={(e) => {
                const v = e.target.value;
                setRrule(v);
                setPresetId(matchPreset(v));
              }}
              placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
              className="dt-input"
              style={{ marginTop: 6, fontSize: 11.5 }}
              aria-label="Custom RRULE"
              spellCheck={false}
            />
          )}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="w-full bg-transparent rounded-md outline-none resize-none"
          style={{
            border: '1px solid var(--border-input)',
            padding: '6px 8px',
            fontSize: 12.5,
            color: 'var(--text-2)',
          }}
        />

        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void deleteEvent(event.id);
              setDraft(null);
              onClose();
            }}
            aria-label="Delete event"
            style={{ color: 'var(--evt-rose)' }}
          >
            <Trash weight="duotone" size={12} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-4)', fontSize: 11 }}>
              <span className="kbd">↵</span> save
              <span className="kbd ml-1">Esc</span> close
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void commitAndClose()}
            >
              Save
            </button>
          </div>
        </div>

        <style>{`
          .dt-input {
            width: 100%;
            background: transparent;
            color: var(--text-2);
            border: 1px solid var(--border-input);
            border-radius: 6px;
            padding: 5px 8px;
            font-size: 12.5px;
            font-family: var(--font-mono);
            font-variant-numeric: tabular-nums;
            outline: none;
            color-scheme: dark light;
          }
          .dt-input:focus {
            border-color: var(--accent-2);
          }
        `}</style>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div
        style={{
          color: 'var(--text-3)',
          fontSize: 11,
          fontWeight: 510,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const margin = 12;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let nx = x;
  let ny = y;
  if (nx + POP_WIDTH + margin > vw) nx = vw - POP_WIDTH - margin;
  if (nx < margin) nx = margin;
  if (ny + POP_HEIGHT_GUESS + margin > vh) ny = vh - POP_HEIGHT_GUESS - margin;
  if (ny < margin) ny = margin;
  return { x: nx, y: ny };
}
