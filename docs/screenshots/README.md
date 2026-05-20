# Screenshot regeneration recipe

These three screenshots ship with the repo and are referenced from the
top-level README:

| File                    | View                | Theme |
| ----------------------- | ------------------- | ----- |
| `month-view-dark.png`   | Month view          | dark  |
| `week-view-light.png`   | Week view (5-day)   | light |
| `event-editor.png`      | Inline event editor | dark  |

## How to regenerate

1. `make setup && pnpm dev` (cold-load seeds the IDB with the demo set).
2. Open `http://localhost:5173` in a Chromium-based browser at viewport
   **1440×900** (DevTools → device toolbar → "Responsive" → set dims).
3. For each shot:
   - **month-view-dark.png** — press `m` for month view, theme picker → Dark.
     Navigate to a month that exercises overflow events (`Shift+j` until
     ≥1 day shows the "+N more" pill).
   - **week-view-light.png** — press `w`, theme picker → Light. Park on a
     week with at least 3 overlapping events to show the layout algorithm.
   - **event-editor.png** — click an existing event to open the editor.
     Pick a non-default color in the color picker so the swatch is visible.
4. Capture with the OS screenshot tool (macOS: `Cmd+Shift+4`, drag the
   viewport region — **not** the full window/chrome).
5. Save as PNG at the filename above. Commit the binaries.

## Why we don't auto-generate

A Playwright capture script was considered but rejected: the value of
these screenshots is showing the design polish, and human framing
beats automated cropping for marketing-grade assets. They change rarely
enough that manual regen is fine.

If automation becomes worthwhile later, the entry point is
`pnpm dlx playwright codegen http://localhost:5173`.
