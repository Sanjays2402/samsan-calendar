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

/**
 * Meta key gating the first-launch demo seed.
 *
 * Once flipped we never auto-seed again, even if the user manually deletes
 * every event — that's deliberate. "Reset to demo" is a separate action the
 * UI will expose later; it wipes events + clears this gate.
 */
const SEED_META_KEY = 'seed.v1';

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
  selectEvent: (id) => set({ selectedEventId: id, draftId: id }),
  setDraft: (id) => set({ draftId: id, selectedEventId: id }),

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
    const prev = get().events[nextEv.id];
    const stamped = { ...nextEv, updatedAt: Date.now() };
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
    const existing = get().events[id];
    if (!existing) return;
    // First in-flight change for this drag — snapshot the original shape.
    if (!dragSnapshots.has(id)) {
      dragSnapshots.set(id, existing);
    }
    const next: CalEvent = { ...existing, ...patch, updatedAt: Date.now() };
    set((s) => ({ events: { ...s.events, [id]: next } }));
  },

  upsertEvent: async (ev) => {
    const stamped = { ...ev, updatedAt: Date.now() };
    const prev = get().events[ev.id] ?? null;
    // Track the pre-drag shape so persistEvent() can record the right undo entry.
    // For brand-new events (prev === null) we record `null`, meaning "the
    // commit is a creation".
    if (!dragSnapshots.has(ev.id)) {
      dragSnapshots.set(ev.id, prev);
    }
    set((s) => ({
      events: { ...s.events, [stamped.id]: stamped },
    }));
    await dbPut(stamped);
  },

  persistEvent: async (id) => {
    const ev = get().events[id];
    if (!ev) {
      dragSnapshots.delete(id);
      return;
    }
    const snapshot = dragSnapshots.has(id)
      ? dragSnapshots.get(id)!
      : null;
    dragSnapshots.delete(id);
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
    const ev = get().events[id];
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
    const ev = get().events[id];
    if (!ev) return;
    set((s) => {
      const nxt = { ...s.events };
      delete nxt[id];
      return {
        events: nxt,
        selectedEventId: s.selectedEventId === id ? null : s.selectedEventId,
        draftId: s.draftId === id ? null : s.draftId,
        undoStack: pushUndo(s.undoStack, {
          kind: 'delete',
          events: [ev],
          label: 'Delete event',
        }),
        redoStack: [],
        toast: {
          id: uidShort(),
          label: `Deleted "${ev.title || 'Untitled'}"`,
          undoId: 'last',
        },
      };
    });
    await dbDelete(id);
  },

  deleteMany: async (ids) => {
    const removed: CalEvent[] = [];
    set((s) => {
      const nxt = { ...s.events };
      for (const id of ids) {
        const ev = s.events[id];
        if (ev) {
          removed.push(ev);
          delete nxt[id];
        }
      }
      if (removed.length === 0) return {};
      return {
        events: nxt,
        selectedEventId: ids.includes(s.selectedEventId ?? '')
          ? null
          : s.selectedEventId,
        draftId: ids.includes(s.draftId ?? '') ? null : s.draftId,
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

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

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
