import { useCallback, useEffect, useState } from 'react';
import { AgendaView } from './components/AgendaView';
import { CommandPalette } from './components/CommandPalette';
import { EventEditor } from './components/EventEditor';
import { HelpSheet } from './components/HelpSheet';
import { Hotkeys } from './components/Hotkeys';
import { MonthView } from './components/MonthView';
import { ThemeManager } from './components/ThemeManager';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { DayView, WeekView } from './components/TimeGrid';
import { useStore } from './store/calendar';
import type { CalEvent } from './types';

function App() {
  const view = useStore((s) => s.view);
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const events = useStore((s) => s.events);
  const draftId = useStore((s) => s.draftId);
  const setDraft = useStore((s) => s.setDraft);

  const [editorAnchor, setEditorAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    // hydrate() also runs the first-launch seed internally (gated on the
    // seed.v1 meta key) — see store/calendar.ts.
    void hydrate();
  }, [hydrate]);

  const onPickEvent = useCallback(
    (ev: CalEvent, anchor: { x: number; y: number }) => {
      setDraft(ev.id);
      setEditorAnchor(anchor);
    },
    [setDraft],
  );

  // When draftId is set by something *other* than the picker (e.g. hotkey `n`),
  // open the editor near the middle of the viewport.
  useEffect(() => {
    if (draftId && !editorAnchor) {
      setEditorAnchor({
        x: Math.max(40, Math.floor(window.innerWidth / 2 - 160)),
        y: Math.max(60, Math.floor(window.innerHeight / 2 - 140)),
      });
    }
    if (!draftId && editorAnchor) {
      setEditorAnchor(null);
    }
  }, [draftId, editorAnchor]);

  const draftEvent = draftId ? events[draftId] : null;

  return (
    <div className="flex flex-col h-full">
      <ThemeManager />
      <Hotkeys />
      <TopBar />
      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{ background: 'var(--bg)' }}
      >
        {!hydrated ? (
          <div
            className="flex-1 grid place-items-center"
            style={{ color: 'var(--text-3)', fontSize: 12 }}
          >
            Loading…
          </div>
        ) : view === 'month' ? (
          <MonthView onPickEvent={onPickEvent} />
        ) : view === 'week' ? (
          <WeekView onPickEvent={onPickEvent} />
        ) : view === 'day' ? (
          <DayView onPickEvent={onPickEvent} />
        ) : (
          <AgendaView onPickEvent={onPickEvent} />
        )}
      </main>

      {draftEvent && editorAnchor && (
        <EventEditor
          event={draftEvent}
          anchor={editorAnchor}
          onClose={() => setEditorAnchor(null)}
        />
      )}

      <CommandPalette />
      <HelpSheet />
      <Toast />
    </div>
  );
}

export default App;
