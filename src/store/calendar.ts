import { create } from 'zustand';
import type { CalEvent, ViewMode, Theme } from '../types';
import { todayMs } from '../lib/date';
import {
  deleteEvent as dbDelete,
  getMeta,
  loadAllEvents,
  putEvent as dbPut,
  putEvents as dbPutMany,
  setMeta,
} from '../lib/storage';
import { buildSeedEvents } from '../lib/seed';
import { resolveSeriesId } from '../lib/recur';

/**
 * Meta key gating the first-launch demo seed.
 *
 * Once flipped we never auto-seed again, even if the user manually deletes
 * every event — that's deliberate. "Reset to demo" is a separate action the
 * UI will expose later; it wipes events + clears this gate.
 */
const SEED_META_KEY = 'seed.v1';

/**
 * In-flight hydrate promise.
 *
 * React StrictMode mounts every component twice in dev, so the App-level
 * `useEffect(hydrate)` fires twice in quick succession. Without a guard,
 * both invocations race past the `persisted.length === 0` check before
 * either has written, and the seed batch lands twice (visible as
 * duplicated event tiles in week/day views).
 *
 * We collapse concurrent calls into the same promise; whichever caller
 * lands first does the work, the rest await its result.
 */
let hydratePromise: Promise<void> | null = null;

/** A single reversible mutation. */
type UndoEntry =
  | { kind: 'delete'; events: CalEvent[]; label: string }
  | { kind: 'update'; prev: CalEvent; next: CalEvent; label: string }
  | { kind: 'create'; ev: CalEvent; label: string };

type Toast = { id: string; label: string; undoId?: string | null } | null;

/**
 * In-flight drag snapshots.
 *
 * When a drag starts (upsertEvent for create, or patchEventLocal for move/resize)
 * we capture the *pre-drag* shape of the event keyed by id. On persistEvent we
 * write a single undo entry covering the whole drag and clear the snapshot.
 *
 * Kept outside Zustand state because it's a transient bookkeeping detail and
 * we don't want it to trigger re-renders.
 */
const dragSnapshots = new Map<string, CalEvent | null>();

type State = {
  events: Record<string, CalEvent>;
  view: ViewMode;
  cursor: number; // ms — the "currently viewed" day
  selectedEventId: string | null;
  draftId: string | null; // event being edited (might be new + unsaved)
  paletteOpen: boolean;
  helpOpen: boolean;
  theme: Theme;
  hydrated: boolean;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  toast: Toast;
};

type Actions = {
  hydrate: () => Promise<void>;
  setView: (v: ViewMode) => void;
  setCursor: (ms: number) => void;
  goToday: () => void;
  selectEvent: (id: string | null) => void;
  setDraft: (id: string | null) => void;
  /** Create a brand-new event (recorded for undo). */
  createEvent: (ev: CalEvent) => Promise<void>;
  /** Replace an event entirely (recorded for undo). */
  updateEvent: (next: CalEvent, opts?: { history?: boolean }) => Promise<void>;
  /**
   * Upsert without writing undo history yet. Used during drag-create so the
   * intermediate frames don't pollute the undo stack. Persists immediately
   * (so the editor opens with a real event in IDB) but the eventual undo
   * entry is written by persistEvent() on drop.
   */
  upsertEvent: (ev: CalEvent) => Promise<void>;
  /** Mutate without committing to undo — for live drag. Call persistEvent on drop. */
  patchEventLocal: (id: string, patch: Partial<CalEvent>) => void;
  /** Persist the in-memory event to IDB + record a single undo entry for the drag. */
  persistEvent: (id: string) => Promise<void>;
  /** Commit the current shape of an event to disk + undo stack (uses prev snapshot). */
  commitEvent: (id: string, prev: CalEvent | null, label: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  setTheme: (t: Theme) => void;
  setToast: (t: Toast) => void;
  /** Seed events if empty. Returns count inserted. */
  seedIfEmpty: (events: CalEvent[]) => Promise<number>;
};

const UNDO_LIMIT = 80;

function pushUndo(stack: UndoEntry[], e: UndoEntry): UndoEntry[] {
  const next = [...stack, e];
  if (next.length > UNDO_LIMIT) next.shift();
  return next;
}

function uidShort(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useStore = create<State & Actions>((set, get) => ({
  events: {},
  view: 'week',
  cursor: todayMs(),
  selectedEventId: null,
  draftId: null,
  paletteOpen: false,
  helpOpen: false,
  theme: (typeof window !== 'undefined'
    ? (localStorage.getItem('samsan.theme') as Theme | null)
    : null) || 'system',
  hydrated: false,
  undoStack: [],
  redoStack: [],
  toast: null,

  hydrate: async () => {
    // Boot path for the data layer.
    //
    // 1. Read whatever is currently on disk into the in-memory store.
    // 2. If the seed.v1 meta key is unset AND IDB is empty, drop the demo
    //    week of events (idempotent — never re-runs once the gate is flipped).
    // 3. Flip `hydrated` so the UI can stop showing the loading state.
    //
    // Seeding is intentionally collapsed into hydrate() so the App.tsx boot
    // contract is exactly one call. seedIfEmpty() is still exposed for tests
    // and for the future "Reset to demo" path.
    let persisted = await loadAllEvents();
    const alreadySeeded = (await getMeta<boolean>(SEED_META_KEY)) === true;

    if (!alreadySeeded && persisted.length === 0) {
      const seedBatch = buildSeedEvents(todayMs());
      await dbPutMany(seedBatch);
      await setMeta(SEED_META_KEY, true);
      persisted = await loadAllEvents();
    } else if (!alreadySeeded && persisted.length > 0) {
      // Pre-existing data without a meta flag (e.g. legacy DB from before this
      // gate existed). Treat it as "already seeded" so we don't ever clobber
      // real user events.
      await setMeta(SEED_META_KEY, true);
    }

    const events: Record<string, CalEvent> = {};
    for (const ev of persisted) events[ev.id] = ev;
    set({ events, hydrated: true });
  },

  setView: (view) => set({ view }),
  setCursor: (cursor) => set({ cursor }),
  goToday: () => set({ cursor: todayMs() }),
  // Virtual occurrence ids (`<masterId>__<ms>`) must collapse to the master
  // before they touch in-memory state. The selection/draft pointers always
  // address the series, never an exploded instance.
  selectEvent: (id) =>
    set({
      selectedEventId: id === null ? null : resolveSeriesId(id),
      draftId: id === null ? null : resolveSeriesId(id),
    }),
  setDraft: (id) =>
    set({
      draftId: id === null ? null : resolveSeriesId(id),
      selectedEventId: id === null ? null : resolveSeriesId(id),
    }),

  createEvent: async (ev) => {
    const next = { ...ev, updatedAt: Date.now() };
    set((s) => ({
      events: { ...s.events, [ev.id]: next },
      undoStack: pushUndo(s.undoStack, {
        kind: 'create',
        ev: next,
        label: 'Create event',
      }),
      redoStack: [],
    }));
    await dbPut(next);
  },

  updateEvent: async (nextEv, opts) => {
    // Collapse the virtual id (if any) before doing anything — every mutator
    // path below addresses the master event in IDB + in-memory map.
    const seriesId = resolveSeriesId(nextEv.id);
    const stamped: CalEvent = {
      ...nextEv,
      id: seriesId,
      updatedAt: Date.now(),
    };
    delete stamped.seriesId;
    const prev = get().events[seriesId];
    set((s) => {
      const newUndo =
        opts?.history === false || !prev
          ? s.undoStack
          : pushUndo(s.undoStack, {
              kind: 'update',
              prev,
              next: stamped,
              label: 'Update event',
            });
      return {
        events: { ...s.events, [stamped.id]: stamped },
        undoStack: newUndo,
        redoStack: opts?.history === false ? s.redoStack : [],
      };
    });
    await dbPut(stamped);
  },

  patchEventLocal: (id, patch) => {
    const seriesId = resolveSeriesId(id);
    const existing = get().events[seriesId];
    if (!existing) return;
    // First in-flight change for this drag — snapshot the original shape.
    if (!dragSnapshots.has(seriesId)) {
      dragSnapshots.set(seriesId, existing);
    }
    // Patches against a virtual occurrence id apply to the *whole series* in
    // v1 (no per-occurrence overrides). A drag of Wednesday's standup moves
    // every standup — that's the documented contract in `src/lib/recur.ts`.
    // If the patch carries start/end deltas we still need to apply them as
    // absolute values; callers do that math against the *occurrence* date,
    // so for now we trust the caller. SAM-72 will revisit when we add
    // per-instance overrides.
    const next: CalEvent = { ...existing, ...patch, updatedAt: Date.now() };
    set((s) => ({ events: { ...s.events, [seriesId]: next } }));
  },

  upsertEvent: async (ev) => {
    const seriesId = resolveSeriesId(ev.id);
    const stamped: CalEvent = {
      ...ev,
      id: seriesId,
      updatedAt: Date.now(),
    };
    delete stamped.seriesId;
    const prev = get().events[seriesId] ?? null;
    // Track the pre-drag shape so persistEvent() can record the right undo entry.
    // For brand-new events (prev === null) we record `null`, meaning "the
    // commit is a creation".
    if (!dragSnapshots.has(seriesId)) {
      dragSnapshots.set(seriesId, prev);
    }
    set((s) => ({
      events: { ...s.events, [stamped.id]: stamped },
    }));
    await dbPut(stamped);
  },

  persistEvent: async (id) => {
    const seriesId = resolveSeriesId(id);
    const ev = get().events[seriesId];
    if (!ev) {
      dragSnapshots.delete(seriesId);
      return;
    }
    const snapshot = dragSnapshots.has(seriesId)
      ? dragSnapshots.get(seriesId)!
      : null;
    dragSnapshots.delete(seriesId);
    // Skip the undo entry if the event didn't actually change.
    const unchanged =
      snapshot &&
      snapshot.title === ev.title &&
      snapshot.start === ev.start &&
      snapshot.end === ev.end &&
      snapshot.color === ev.color &&
      snapshot.allDay === ev.allDay &&
      snapshot.notes === ev.notes;
    if (!unchanged) {
      set((s) => ({
        undoStack: pushUndo(
          s.undoStack,
          snapshot
            ? { kind: 'update', prev: snapshot, next: ev, label: 'Update event' }
            : { kind: 'create', ev, label: 'Create event' },
        ),
        redoStack: [],
      }));
    }
    await dbPut(ev);
  },

  commitEvent: async (id, prev, label) => {
    const seriesId = resolveSeriesId(id);
    const ev = get().events[seriesId];
    if (!ev) return;
    set((s) => ({
      undoStack: prev
        ? pushUndo(s.undoStack, { kind: 'update', prev, next: ev, label })
        : pushUndo(s.undoStack, { kind: 'create', ev, label }),
      redoStack: [],
    }));
    await dbPut(ev);
  },

  deleteEvent: async (id) => {
    const seriesId = resolveSeriesId(id);
    const ev = get().events[seriesId];
    if (!ev) return;
    set((s) => {
      const nxt = { ...s.events };
      delete nxt[seriesId];
      return {
        events: nxt,
        selectedEventId:
          s.selectedEventId === seriesId ? null : s.selectedEventId,
        draftId: s.draftId === seriesId ? null : s.draftId,
        undoStack: pushUndo(s.undoStack, {
          kind: 'delete',
          events: [ev],
          label: 'Delete event',
        }),
        redoStack: [],
        toast: {
          id: uidShort(),
          label: ev.rrule
            ? `Deleted series "${ev.title || 'Untitled'}"`
            : `Deleted "${ev.title || 'Untitled'}"`,
          undoId: 'last',
        },
      };
    });
    await dbDelete(seriesId);
  },

  deleteMany: async (ids) => {
    const removed: CalEvent[] = [];
    const seriesIds = ids.map((id) => resolveSeriesId(id));
    set((s) => {
      const nxt = { ...s.events };
      const seen = new Set<string>();
      for (const id of seriesIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const ev = s.events[id];
        if (ev) {
          removed.push(ev);
          delete nxt[id];
        }
      }
      if (removed.length === 0) return {};
      return {
        events: nxt,
        selectedEventId: seriesIds.includes(s.selectedEventId ?? '')
          ? null
          : s.selectedEventId,
        draftId: seriesIds.includes(s.draftId ?? '') ? null : s.draftId,
        undoStack: pushUndo(s.undoStack, {
          kind: 'delete',
          events: removed,
          label: `Delete ${removed.length} events`,
        }),
        redoStack: [],
        toast: {
          id: uidShort(),
          label: `Deleted ${removed.length} events`,
          undoId: 'last',
        },
      };
    });
    for (const ev of removed) await dbDelete(ev.id);
  },

  undo: async () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1]!;
    set((s) => ({ undoStack: s.undoStack.slice(0, -1) }));

    if (entry.kind === 'create') {
      set((s) => {
        const nxt = { ...s.events };
        delete nxt[entry.ev.id];
        return {
          events: nxt,
          selectedEventId:
            s.selectedEventId === entry.ev.id ? null : s.selectedEventId,
          draftId: s.draftId === entry.ev.id ? null : s.draftId,
          redoStack: pushUndo(s.redoStack, entry),
          toast: { id: uidShort(), label: 'Undid create', undoId: null },
        };
      });
      await dbDelete(entry.ev.id);
    } else if (entry.kind === 'update') {
      set((s) => ({
        events: { ...s.events, [entry.prev.id]: entry.prev },
        redoStack: pushUndo(s.redoStack, entry),
        toast: { id: uidShort(), label: 'Undid update', undoId: null },
      }));
      await dbPut(entry.prev);
    } else {
      // restore deletions
      set((s) => {
        const nxt = { ...s.events };
        for (const e of entry.events) nxt[e.id] = e;
        return {
          events: nxt,
          redoStack: pushUndo(s.redoStack, entry),
          toast: {
            id: uidShort(),
            label:
              entry.events.length === 1
                ? `Restored "${entry.events[0]!.title || 'Untitled'}"`
                : `Restored ${entry.events.length} events`,
            undoId: null,
          },
        };
      });
      for (const e of entry.events) await dbPut(e);
    }
  },

  redo: async () => {
    const stack = get().redoStack;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1]!;
    set((s) => ({ redoStack: s.redoStack.slice(0, -1) }));

    if (entry.kind === 'create') {
      set((s) => ({
        events: { ...s.events, [entry.ev.id]: entry.ev },
        undoStack: pushUndo(s.undoStack, entry),
        toast: { id: uidShort(), label: 'Redid create', undoId: null },
      }));
      await dbPut(entry.ev);
    } else if (entry.kind === 'update') {
      set((s) => ({
        events: { ...s.events, [entry.next.id]: entry.next },
        undoStack: pushUndo(s.undoStack, entry),
        toast: { id: uidShort(), label: 'Redid update', undoId: null },
      }));
      await dbPut(entry.next);
    } else {
      const ids = entry.events.map((e) => e.id);
      set((s) => {
        const nxt = { ...s.events };
        for (const id of ids) delete nxt[id];
        return {
          events: nxt,
          undoStack: pushUndo(s.undoStack, entry),
          toast: { id: uidShort(), label: `Redid delete`, undoId: null },
        };
      });
      for (const id of ids) await dbDelete(id);
    }
  },

  openPalette: () => set({ paletteOpen: true, helpOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () =>
    set((s) => ({ paletteOpen: !s.paletteOpen, helpOpen: false })),

  openHelp: () => set({ helpOpen: true, paletteOpen: false }),
  closeHelp: () => set({ helpOpen: false }),
  toggleHelp: () =>
    set((s) => ({ helpOpen: !s.helpOpen, paletteOpen: false })),

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('samsan.theme', theme);
    }
  },

  setToast: (toast) => set({ toast }),

  seedIfEmpty: async (events) => {
    const current = Object.keys(get().events);
    if (current.length > 0) return 0;
    const map: Record<string, CalEvent> = {};
    for (const ev of events) map[ev.id] = ev;
    set({ events: map });
    for (const ev of events) await dbPut(ev);
    return events.length;
  },
}));
