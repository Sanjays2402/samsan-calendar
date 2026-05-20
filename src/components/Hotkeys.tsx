import { useEffect } from 'react';
import { useStore } from '../store/calendar';
import {
  addDaysMs,
  addMinutesMs,
  snapToMinutes,
  startOfDayMs,
  todayMs,
} from '../lib/date';
import { uid } from '../lib/uid';
import type { ViewMode } from '../types';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/** Step size in days for the active view: day=1, week/month=7, agenda=1. */
function stepDays(view: ViewMode): number {
  if (view === 'day') return 1;
  if (view === 'agenda') return 1;
  // week + month both navigate a week at a time with j/k — month users still
  // want a week-step there because day-step inside a month feels too small.
  return 7;
}

export function Hotkeys() {
  const view = useStore((s) => s.view);
  const cursor = useStore((s) => s.cursor);
  const setView = useStore((s) => s.setView);
  const setCursor = useStore((s) => s.setCursor);
  const goToday = useStore((s) => s.goToday);
  const togglePalette = useStore((s) => s.togglePalette);
  const closePalette = useStore((s) => s.closePalette);
  const openPalette = useStore((s) => s.openPalette);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const draftId = useStore((s) => s.draftId);
  const setDraft = useStore((s) => s.setDraft);
  const upsertEvent = useStore((s) => s.upsertEvent);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const deleteEvent = useStore((s) => s.deleteEvent);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K always toggles palette
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        togglePalette();
        return;
      }

      if (e.key === 'Escape') {
        if (paletteOpen) {
          closePalette();
          return;
        }
        if (draftId) {
          setDraft(null);
          return;
        }
      }

      if (isTypingTarget(e.target)) return;

      const step = stepDays(view);

      switch (e.key) {
        case '/':
          e.preventDefault();
          openPalette();
          return;
        case 't':
        case 'T':
          e.preventDefault();
          goToday();
          return;
        case 'm':
        case 'M':
          e.preventDefault();
          setView('month');
          return;
        case 'w':
        case 'W':
          e.preventDefault();
          setView('week');
          return;
        case 'd':
        case 'D':
          e.preventDefault();
          setView('day');
          return;
        case 'a':
        case 'A':
          // Conflict-free: no existing single-key binding for `a`. Mirrors
          // m/w/d so all four views are reachable from the keyboard.
          e.preventDefault();
          setView('agenda');
          return;
        case 'j':
          e.preventDefault();
          setCursor(addDaysMs(cursor, step));
          return;
        case 'k':
          e.preventDefault();
          setCursor(addDaysMs(cursor, -step));
          return;
        case 'ArrowRight':
          e.preventDefault();
          setCursor(addDaysMs(cursor, 1));
          return;
        case 'ArrowLeft':
          e.preventDefault();
          setCursor(addDaysMs(cursor, -1));
          return;
        case 'ArrowDown':
          // In agenda view the user expects ArrowDown to scroll the list, not
          // re-anchor the window. Leave the default scroll behaviour intact.
          if (view === 'agenda') return;
          e.preventDefault();
          setCursor(addDaysMs(cursor, view === 'month' ? 7 : 1));
          return;
        case 'ArrowUp':
          if (view === 'agenda') return;
          e.preventDefault();
          setCursor(addDaysMs(cursor, view === 'month' ? -7 : -1));
          return;
        case 'n':
        case 'N': {
          e.preventDefault();
          // "n" at current cursor day, near now snapped to next 30m
          const todayStart = startOfDayMs(todayMs());
          const cursorDay = startOfDayMs(cursor);
          const offset = cursorDay - todayStart;
          const baseStart = snapToMinutes(
            addMinutesMs(Date.now(), 15),
            30,
          );
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
          return;
        }
        case 'Backspace':
        case 'Delete':
          if (selectedEventId && !draftId) {
            e.preventDefault();
            void deleteEvent(selectedEventId);
          }
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    view,
    cursor,
    paletteOpen,
    draftId,
    selectedEventId,
    setView,
    setCursor,
    goToday,
    togglePalette,
    openPalette,
    closePalette,
    setDraft,
    upsertEvent,
    deleteEvent,
  ]);

  return null;
}
