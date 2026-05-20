# Samsan Calendar

A local-first, modern web calendar. Linear / Vercel / Raycast aesthetic, zero backend,
all data stored in IndexedDB. Month / week / day views, drag-to-reschedule,
drag-edge-to-resize, keyboard-first navigation.

Built with **Vite + React 19 + TypeScript + Tailwind v4 + Zustand + idb**.

---

## Quickstart

```bash
make setup      # pnpm install --frozen-lockfile
make dev        # http://localhost:5173
```

Or directly:

```bash
pnpm install
pnpm dev
```

## What's inside

```
src/
  components/     # MonthView, TimeGrid (week + day), EventEditor, TopBar, Hotkeys
  lib/            # date, colors, layout, storage (IDB), seed
  store/          # zustand store (events, view, theme, hotkeys)
  types.ts        # CalendarEvent, View, Theme
```

| Concern              | Where                              |
| -------------------- | ---------------------------------- |
| Persistence (IDB v1) | `src/lib/storage.ts`               |
| Date math            | `src/lib/date.ts` (date-fns)       |
| Event layout         | `src/lib/layout.ts`                |
| Color tokens         | `src/lib/colors.ts`                |
| State                | `src/store/calendar.ts` (Zustand)  |
| Hotkeys              | `src/components/Hotkeys.tsx`       |

## Keyboard shortcuts

| Key       | Action               |
| --------- | -------------------- |
| `j` / `k` | navigate back / fwd  |
| `n`       | new event            |
| `t`       | jump to today        |
| `m`       | switch to month view |
| `w`       | switch to week view  |
| `d`       | switch to day view   |
| `Esc`     | close editor / modal |

## Scripts

| Command          | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Vite dev server on `:5173`                       |
| `pnpm build`     | `tsc -b --noEmit && vite build` → `dist/`        |
| `pnpm preview`   | Serve the production build on `:5173`            |
| `pnpm typecheck` | `tsc -b --noEmit`                                |
| `make lighthouse`| Build + run Lighthouse CI locally (budgets in `lighthouserc.json`) |
| `make clean`     | Wipe `dist/`, `node_modules/`, LHCI artifacts    |

## Screenshots

| File                                       | View                                |
| ------------------------------------------ | ----------------------------------- |
| `docs/screenshots/month-view-dark.png`     | Month view, dark theme              |
| `docs/screenshots/week-view-light.png`     | Week view, light theme              |
| `docs/screenshots/event-editor.png`        | Inline event editor with color picker |

> Regenerate with `pnpm dev` running, then capture each view at 1440×900 from
> the browser. See [`docs/screenshots/README.md`](docs/screenshots/README.md)
> for the exact recipe.

## CI

Two workflows in `.github/workflows/calendar.yml`:

1. **build** — typecheck, build, upload `dist/` artifact.
2. **lighthouse** — build, run `@lhci/cli autorun` against the static `dist/`,
   fail if Performance / Accessibility / Best Practices drop below **95** or
   SEO drops below **90**. Reports uploaded as a workflow artifact.

Budgets live in [`lighthouserc.json`](lighthouserc.json) at the repo root.
Workflow is gated to PRs and pushes to `main`. Concurrency is per-ref with
`cancel-in-progress` so superseded runs are killed automatically.

## Design notes

- **One accent color.** Indigo. Surfaces, not boxes. Hairline borders, no
  drop shadows except on hover. See `src/index.css` design tokens.
- **Phosphor duotone icons** throughout.
- **Inter + JetBrains Mono** (latter for time digits only).
- **View transitions** via the View Transitions API; falls back to plain
  swap when unsupported.

## Why

A calendar shouldn't look like Google Calendar 2014. Linear's team makes
software that feels weightless. This is the calendar they'd ship if they
made one.

## License

Private. Internal Samsan project.
