# Screenshot regeneration

Canonical screenshots live in `design/screenshots/`. The same three files are
mirrored here so README links resolve from any subtree:

| File                    | View                | Theme |
| ----------------------- | ------------------- | ----- |
| `month-view-dark.png`   | Month view          | dark  |
| `week-view-light.png`   | Week view (5-day)   | light |
| `event-editor.png`      | Inline event editor | dark  |

## Automated (preferred)

```bash
pnpm dev              # in one terminal — starts Vite on :5173 with demo seed
node scripts/capture-screenshots.mjs --base http://127.0.0.1:5173 --out design/screenshots
cp design/screenshots/{month-view-dark,week-view-light,event-editor}.png docs/screenshots/
```

The capture script (`scripts/capture-screenshots.mjs`) drives Playwright at
1440×900 @ 2× DPR, switches themes via the store, and snaps each view to PNG.

## Manual fallback

If Playwright is unavailable:

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
