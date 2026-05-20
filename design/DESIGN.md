---
version: alpha
name: Samsan Calendar
description: A deep-neutral calendar with a single indigo accent — Linear's precision applied to time.
colors:
  primary: "#5e6ad2"
  primary-dark: "#4f56b8"
  primary-bright: "#7170ff"
  tertiary: "#828fff"
  neutral: "#08090a"
  ink: "#f7f8f8"
  ink-2: "#d0d6e0"
  ink-3: "#8a8f98"
  ink-dim: "#a1a6af"
  panel: "#0f1011"
  surface: "#191a1b"
  surface-2: "#1f2022"
  border-subtle: "#191a1b"
  border: "#22232a"
  border-strong: "#2a2c33"
  focus-ring: "#7170ff"
  evt-focus: "#aab2ff"
  evt-focus-bg: "#1b1c36"
  evt-personal: "#34d399"
  evt-personal-bg: "#102d24"
  evt-social: "#f4b942"
  evt-social-bg: "#322914"
  evt-deadline: "#ec6a8c"
  evt-deadline-bg: "#311a21"
  evt-travel: "#5fb3f3"
  evt-travel-bg: "#182834"
  evt-creative: "#b69bff"
  evt-creative-bg: "#272336"
typography:
  display:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 590
    lineHeight: 1.18
    letterSpacing: "-0.018em"
  h1:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 590
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  h2:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 590
    lineHeight: 1.3
    letterSpacing: "-0.006em"
  body:
    fontFamily: Inter
    fontSize: 13.5px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: 510
    letterSpacing: "0.06em"
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 400
    letterSpacing: "-0.01em"
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
    letterSpacing: "-0.01em"
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
  xxxl: 32px
  xxxxl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 8px
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 8px
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: 8px
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 8px
  event-chip-focus:
    backgroundColor: "{colors.evt-focus-bg}"
    textColor: "{colors.evt-focus}"
    rounded: "{rounded.md}"
    padding: 6px
  event-chip-personal:
    backgroundColor: "{colors.evt-personal-bg}"
    textColor: "{colors.evt-personal}"
    rounded: "{rounded.md}"
    padding: 6px
  event-chip-social:
    backgroundColor: "{colors.evt-social-bg}"
    textColor: "{colors.evt-social}"
    rounded: "{rounded.md}"
    padding: 6px
  event-chip-deadline:
    backgroundColor: "{colors.evt-deadline-bg}"
    textColor: "{colors.evt-deadline}"
    rounded: "{rounded.md}"
    padding: 6px
  event-chip-travel:
    backgroundColor: "{colors.evt-travel-bg}"
    textColor: "{colors.evt-travel}"
    rounded: "{rounded.md}"
    padding: 6px
  event-chip-creative:
    backgroundColor: "{colors.evt-creative-bg}"
    textColor: "{colors.evt-creative}"
    rounded: "{rounded.md}"
    padding: 6px
  today-circle:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    size: 22px
  cell-day:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: 8px
  cell-day-other-month:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sm}"
    padding: 8px
  divider:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.ink-3}"
    height: 1px
  border-rule:
    backgroundColor: "{colors.border}"
    textColor: "{colors.ink-3}"
    height: 1px
  border-rule-strong:
    backgroundColor: "{colors.border-strong}"
    textColor: "{colors.ink-2}"
    height: 1px
  panel-pressed:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 6px
  palette-caret:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    width: 2px
    height: 14px
  kbd:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: 4px
  link-text:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.sm}"
    padding: 0px
  input-focus:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.focus-ring}"
    rounded: "{rounded.md}"
    padding: 8px
  now-line:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary-bright}"
    rounded: "{rounded.pill}"
    height: 2px
  panel-surface:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 16px
  modal-overlay:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: 20px
---

## Overview

Samsan Calendar is a personal calendar designed for engineers and product people who spend their day in keyboard-first software (Linear, Raycast, Notion, Vercel). It is **not** a Google Calendar clone. The brief: build the calendar Linear would ship if they made one.

Three principles drive every visual decision:

1. **Surfaces, not boxes.** Hairline borders, no drop shadows except on hover/overlay. Depth comes from the background hierarchy (`neutral` → `panel` → `surface` → `surface-2`), not from shadows or cards stacked on cards.
2. **One accent.** Indigo carries every interactive signal — selection, "now" marker, focus ring, primary button, command palette caret. The six semantic event colors are calm, muted, and never compete with indigo for attention.
3. **Time is data.** Time digits are JetBrains Mono. Counts and durations are mono. The grid is precise (15-min snap, 48px/hour). Calendars that mix proportional and mono numerals look like 2014; mono numerals read as software.

The design assumes dark is primary. Light is a deliberate alternative, not an afterthought — every token has a matched light counterpart in `src/index.css`.

## Colors

**Neutrals (background hierarchy, dark-first):**

- `neutral` (`#08090a`) — page background. Just barely not black so OLEDs don't crush detail.
- `panel` (`#0f1011`) — sidebar, app chrome.
- `surface` (`#191a1b`) — event chips, modal cards, hovered cells.
- `surface-2` (`#1f2022`) — pressed states, palette caret backdrop.

**Ink (text):**

- `ink` (`#f7f8f8`) — primary text.
- `ink-2` (`#d0d6e0`) — secondary text and most icons.
- `ink-3` (`#8a8f98`) — tertiary, "yesterday and earlier."
- `ink-dim` (`#a1a6af`) — adjacent-month days. Brighter than you'd guess from looking at it — needed to clear WCAG AA on the `neutral` background.

**Indigo (the single accent):**

- `primary` (`#5e6ad2`) — base. Used on light-mode borders, focus rings, primary buttons, and the today-circle.
- `primary-dark` (`#4f56b8`) — primary button hover. Reads as "press down," not "light up."
- `primary-bright` (`#7170ff`) — brighter dark-mode tint. Used on the now-line and the focus ring.
- `tertiary` (`#828fff`) — hovered indigo, command palette caret on focus, link text.

**Event semantics (calm, muted, each carries intent):**

- `evt-focus` indigo — deep work, focus blocks, default for unlabeled events. ("If you don't know, it's focus.")
- `evt-personal` emerald — workouts, meals, errands, time off.
- `evt-social` amber — meetings, 1:1s, calls.
- `evt-deadline` rose — ship dates, contracts, anything that has a hard deadline. Never used decoratively.
- `evt-travel` sky — flights, drives, commute.
- `evt-creative` violet — design reviews, writing blocks, brainstorms.

These are **not arbitrary swatches.** A user looking at a week should be able to read at a glance: "indigo column means heads-down week, amber-heavy means meeting hell, rose appearing means a deadline is in this view." Color earns its place by encoding intent.

WCAG: all event chip backgrounds are soft-fill (12–18% alpha over `neutral`), with full-saturation text colors at ≥4.5:1 against the chip background. Verified in the lint.

## Typography

Inter for everything visual. JetBrains Mono for every numeric time. No third family.

Inter has a 510 weight that I use deliberately. It's the "weight that doesn't quite hit semibold" — perfect for the LABEL caps (day-of-week headers, view toggle pills) where 500 looks anemic but 600 looks like it's shouting.

Scale (8 sizes — anything more is bloat):

- `display` 22px / 590 / -0.018em — view date header ("May 2026").
- `h1` 18px / 590 — modal titles, command palette empty state.
- `h2` 14px / 590 — section labels in editor (Date, Time, Color).
- `body` 13.5px / 400 — default app text. Tight, readable on near-black.
- `body-sm` 12px / 400 — secondary descriptions, status row text.
- `label` 10.5px / 510 / uppercase / +0.06em — column headers ("SUN MON TUE…"), keyboard-shortcut hints.
- `mono-sm` 11px JetBrains Mono — time gutter labels ("9a", "10a", "11a").
- `mono-md` 13px / 500 JetBrains Mono — event start/end times inside chips.

Letter-spacing is negative on every Inter size ≥13px. This is non-obvious but critical — Inter at default tracking on dark backgrounds reads "loose." -0.005 to -0.018em closes it back up.

## Layout

- App grid: 224px sidebar (left) + 1fr canvas + 360px right inspector (only when an event is selected).
- View canvas: 56px top toolbar + 28px day-of-week header (week/day only) + scrollable grid.
- Week/day grid: 56px time gutter on the left, then 7 day columns (week) or 1 column (day) with hairline `border-subtle` separators.
- Hour row: 48px tall. 15-min snap = 12px. This gives every event a minimum 24px height (half-hour) which is the smallest hit target where the title still reads.
- Month grid: 6 rows × 7 cols, each cell ~118×128. Date number lives top-left, ~28px circular today indicator wraps it on the current day.

**Spacing base = 4px.** All padding, margin, and gap values come from `spacing`. Anything off-scale gets flagged in review.

## Elevation

Three elevation tiers — implemented as background shifts and borders, not shadows:

1. **Page** (`neutral`) — flat. Always.
2. **Surface** (`panel` → `surface`) — anything floating: sidebar, toolbar, event chip on a cell. No shadow.
3. **Overlay** (`panel` + `shadow-overlay` + `border-strong`) — only the event editor, command palette, and confirmation dialogs. This is the **one** place shadows exist in the app. They earn their pixels.

The shadow-overlay token in `src/index.css` is a layered Linear-style stack: subtle inner ambient + crisp 1px stroke + soft 24px diffusion. Don't replace it with `0 8px 24px rgba(0,0,0,0.5)` — that looks 2018.

## Shapes

| Token | Value | Used for |
|-------|-------|----------|
| `sm` | 4px | Inline buttons, key cap badges, small chips |
| `md` | 6px | Event chips, ghost buttons, the today-circle's inner |
| `lg` | 8px | Panels, dropdown menus, palette items |
| `xl` | 12px | Event editor, command palette, dialogs |
| `pill` | 9999px | View-mode toggle, theme picker |

## Components

The `components:` block in front matter is the build target. Notes on the interesting ones:

**Event chip** — soft-fill background (12–18% alpha of the event color over the cell background) + a 2px left border in the full event color + `mono-md` time label + `body` title in `ink`. This is the design's signature move. It's not a sticker, it's a data card.

**Today circle** — 22px diameter, `primary` background, white text, centered on the date number. Only on the day that `isToday()` returns true. Other dates: just the number in `ink-2` (current month) or `ink-dim` (adjacent month).

**Now line** — 1px horizontal `primary-bright` line spanning the visible day columns (week view) or single column (day view), with a 6px circular dot on the left edge of today's column. Animated in on view mount. Updates every 60s.

**View toggle pill** — segmented control. Three options (D/W/M). Active segment gets `surface` background + `ink` text; inactive segments are `panel` + `ink-3`. No border between segments — the surface shift IS the affordance.

**Command palette caret** — vertical 2px `primary` bar, blinking at 1.4s interval with `cubic-bezier(0.16, 1, 0.3, 1)` opacity from 1 → 0.35 → 1. NOT a generic CSS blink (which is linear) — the spring easing makes it feel alive.

## Motion

Two durations, one easing, one rule: motion is a hint, not a performance.

- `--motion-fast`: 120ms — hover state changes, focus rings appearing, button background shifts.
- `--motion-slow`: 220ms — view transitions (D ↔ W ↔ M), modal open/close, command palette mount.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` — Linear's signature spring-out. Used everywhere. Never use `ease-in-out` (boring), `linear` (mechanical), or custom one-offs (inconsistent).
- Reduced-motion: when `prefers-reduced-motion: reduce`, every transition collapses to 1ms. No exceptions. No "but this one looks nice." The user said off.

Transforms only — no animating `left`/`top`/`width` (compositor-cheap means it stays buttery on the 6×7 month grid). When an event chip enters the DOM, it fades from `opacity:0 + scale(0.96)` to `opacity:1 + scale(1)` over `--motion-fast`. That's it. No bounce.

## Do's and Don'ts

**Do:**
- Use `mono-md` for ANY numeric time string. No exceptions.
- Use the 6 event semantic colors only — never invent a 7th.
- Honor `prefers-reduced-motion: reduce` by setting all transitions to 1ms.
- Use the same easing token (`--transition`) for every animation. Consistent motion language > "fun" easings.
- Use `text-wrap: pretty` on multi-line event titles and modal copy.

**Don't:**
- Don't add drop shadows to event chips. Surface hierarchy already creates the layering.
- Don't use a colored row backdrop to indicate "today" in week view (Google Calendar style). The today-circle in the day-of-week header is enough.
- Don't introduce a 7th event color "just for one thing." If a user needs more taxonomy, that's a labels feature, not a color feature.
- Don't use system emoji as event icons. If iconography appears, it's Phosphor duotone, sized at 16px, color `ink-3`.
- Don't make the now-line red. Red carries deadline semantics in this system. The now-line is indigo.
- Don't fade events that are "in the past." All events read at full strength regardless of time. The now-line is the only temporal cue inside the grid.
