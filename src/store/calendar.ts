import { create } from 'zustand';
import type { CalEvent, ViewMode, Theme } from '../types';
import { todayMs } from '../lib/date';
import {
  deleteEvent as dbDelete,
  loadAllEvents,
  putEvent as dbPut,
} from '../lib/storage';

type State = {
  events: Record<string, CalEvent>;
  view: ViewMode;
  cursor: number; // ms — the "currently viewed" day
  selectedEventId: string | null;
  draftId: string | null; // event being edited (might be new + unsaved)
  paletteOpen: boolean;
  theme: Theme;
  hydrated: boolean;
};

type Actions = {
  hydrate: () => Promise<void>;
  setView: (v: ViewMode) => void;
  setCursor: (ms: number) => void;
  goToday: () => void;
  selectEvent: (id: string | null) => void;
  setDraft: (id: string | null) => void;
  upsertEvent: (ev: CalEvent) => Promise<void>;
  /** Update without persisting (for live drag — call persistDraft on drop) */
  patchEventLocal: (id: string, patch: Partial<CalEvent>) => void;
  persistEvent: (id: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setTheme: (t: Theme) => void;
};

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

  hydrate: async () => {
    const evs = await loadAllEvents();
    const events: Record<string, CalEvent> = {};
    for (const ev of evs) events[ev.id] = ev;
    set({ events, hydrated: true });
  },

  setView: (view) => set({ view }),
  setCursor: (cursor) => set({ cursor }),
  goToday: () => set({ cursor: todayMs() }),
  selectEvent: (id) => set({ selectedEventId: id, draftId: id }),
  setDraft: (id) => set({ draftId: id, selectedEventId: id }),

  upsertEvent: async (ev) => {
    const next = { ...ev, updatedAt: Date.now() };
    set((s) => ({ events: { ...s.events, [ev.id]: next } }));
    await dbPut(next);
  },

  patchEventLocal: (id, patch) => {
    const existing = get().events[id];
    if (!existing) return;
    const next: CalEvent = { ...existing, ...patch, updatedAt: Date.now() };
    set((s) => ({ events: { ...s.events, [id]: next } }));
  },

  persistEvent: async (id) => {
    const ev = get().events[id];
    if (!ev) return;
    await dbPut(ev);
  },

  deleteEvent: async (id) => {
    set((s) => {
      const nxt = { ...s.events };
      delete nxt[id];
      const nextSelected =
        s.selectedEventId === id ? null : s.selectedEventId;
      const nextDraft = s.draftId === id ? null : s.draftId;
      return {
        events: nxt,
        selectedEventId: nextSelected,
        draftId: nextDraft,
      };
    });
    await dbDelete(id);
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
}));
