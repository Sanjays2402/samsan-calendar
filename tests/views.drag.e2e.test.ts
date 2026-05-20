/**
 * SAM-60 end-to-end smoke: prove the three view interactions actually work in
 * a real Chromium against `pnpm dev`. Specifically:
 *
 *   1. Day / Week / Month view buttons swap the canvas without console errors
 *   2. WeekView drag-to-create produces a fresh event (covers TimeGrid.create)
 *   3. WeekView drag-bottom-edge resizes the new event (covers TimeGrid.resize)
 *   4. MonthView drag-to-reschedule moves an event by N days (covers MonthView)
 *
 * The dev server must be running on localhost:5173 before you run this
 * (`make dev` or `pnpm dev` in another terminal). The test does not spin
 * Vite itself.
 *
 * Quality bar: we exercise pointer events at the DOM level — the same surface
 * a real user hits — not the store. If TimeGrid's pointer wiring regresses,
 * this catches it.
 */
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';

const URL = 'http://localhost:5173/';

async function withBrowser<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      acceptDownloads: false,
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    // App hydrates from IDB on first paint — wait for the topbar.
    await page.waitForSelector('header', { timeout: 5000 });
    // And wait for the first view to mount (loading screen gone).
    await page.waitForSelector('[data-testid="time-grid"], [role="grid"], .event-chip', {
      timeout: 5000,
    }).catch(() => {/* week view is the default — TimeGrid should be there */});
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function switchView(page: Page, v: 'day' | 'week' | 'month' | 'agenda') {
  // Tablist buttons in TopBar have role="tab" and accessible text "Day"/"Week"/...
  const label = v[0]!.toUpperCase() + v.slice(1);
  await page.getByRole('tab', { name: label }).click();
  // The view swap fires both a 180ms ::view-transition and a 200ms .fade-in
  // animation on the new canvas. During the view-transition dead window the
  // UA hides the live DOM behind top-layer snapshots, and `elementFromPoint`
  // over a chip returns <html> — so pointerdown never reaches React. Wait
  // until no `::view-transition*` pseudo-element animations are running.
  // We ignore other animations (e.g. infinite cursor pulses) because they
  // never reach `finished` and would spuriously time us out.
  await page.waitForFunction(
    () => {
      const anims = document.getAnimations();
      const vt = anims.filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
        return t === document.documentElement && pseudo.startsWith('::view-transition');
      });
      return vt.every((a) => a.playState === 'finished' || a.playState === 'idle');
    },
    null,
    { timeout: 2000 },
  );
}

describe('SAM-60: views + drag interactions', () => {
  test('day/week/month view buttons swap the canvas with no console errors', async () => {
    await withBrowser(async (page) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      // Default view is week — TimeGrid should be present.
      await page.waitForSelector('[data-testid="time-grid"]', { timeout: 3000 });

      await switchView(page, 'day');
      await page.waitForSelector('[data-testid="time-grid"]', { timeout: 3000 });
      // DayView renders only 1 day column — count = 2 grid-template cols
      // (gutter + 1 day). Easier proof: header shows just one day cell.
      // Confirm TimeGrid still alive.
      const dayGridVisible = await page.locator('[data-testid="time-grid"]').count();
      assert.equal(dayGridVisible, 1, 'day view should mount TimeGrid');

      await switchView(page, 'month');
      // MonthView doesn't render TimeGrid — it renders a 7-column grid.
      await page.waitForFunction(
        () => document.querySelector('[data-testid="time-grid"]') === null,
        null,
        { timeout: 2000 },
      );
      // Day cells are role=button with aria-label "EEEE, MMM d" — at least 28.
      const monthCells = await page.locator('[role="button"][aria-label*=","]').count();
      assert.ok(monthCells >= 28, `month should render 6×7 cells, got ${monthCells}`);

      await switchView(page, 'week');
      await page.waitForSelector('[data-testid="time-grid"]', { timeout: 3000 });

      assert.equal(errors.length, 0, `no console errors expected, got: ${errors.join(' | ')}`);
    });
  });

  test('WeekView: drag-to-create produces a new event', async () => {
    await withBrowser(async (page) => {
      await switchView(page, 'week');
      const grid = page.locator('[data-testid="time-grid"]');
      await grid.waitFor({ state: 'visible' });
      const box = (await grid.boundingBox())!;
      assert.ok(box, 'time-grid must have a bounding box');

      // Count events before the drag.
      const before = await page.locator('[data-event-id]').count();

      // Drag in column 4 (middle-ish), from ~y=480 to ~y=620 in grid-relative
      // coords. TimeGrid is 48px/hour starting at midnight; y=480 ≈ 10:00,
      // y=620 ≈ 12:55. The drag should yield a ~3h event.
      const colWidth = box.width / 7;
      const x = box.x + colWidth * 4 + colWidth / 2;
      const y1 = box.y + 480;
      const y2 = box.y + 620;

      await page.mouse.move(x, y1);
      await page.mouse.down();
      // Step the mouse so the pointermove handler fires.
      const STEPS = 8;
      for (let i = 1; i <= STEPS; i++) {
        await page.mouse.move(x, y1 + ((y2 - y1) * i) / STEPS);
      }
      await page.mouse.up();

      // Editor mounts with an "Add title" input — drag-create opens the inline editor.
      const editor = await page
        .waitForSelector('input[placeholder="Add title"]', { timeout: 2000 })
        .catch(() => null);
      assert.ok(editor, 'inline editor should open after drag-create');

      // Type a unique title and Enter.
      const unique = `SAM-60-drag-${Date.now().toString(36)}`;
      await editor!.fill(unique);
      await page.keyboard.press('Enter');

      await page.waitForTimeout(400);
      const after = await page.locator('[data-event-id]').count();
      assert.ok(after > before, `event count should grow: before=${before} after=${after}`);
      // And the chip with our title is present.
      const tile = page.locator(`[aria-label="${unique}"]`).first();
      assert.equal(await tile.count(), 1, 'created event chip should be in the DOM');
    });
  });

  test('WeekView: drag bottom edge of an event resizes it', async () => {
    await withBrowser(async (page) => {
      await switchView(page, 'week');
      // Ensure there's at least one event to resize — seed events should be
      // present after hydrate. If empty, drag-create one first.
      let chipCount = await page.locator('[data-event-id]').count();
      if (chipCount === 0) {
        // Fallback: hotkey `n` to create a draft, save with default 1h.
        await page.keyboard.press('n');
        const e = await page
          .waitForSelector('input[placeholder="Add title"]', { timeout: 1500 })
          .catch(() => null);
        if (e) {
          await e.fill('SAM-60 resize seed');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
        chipCount = await page.locator('[data-event-id]').count();
      }
      assert.ok(chipCount > 0, 'need at least one event chip to resize');

      // Pick the first event chip on screen.
      const chip = page.locator('[data-event-id]').first();
      const idBefore = await chip.getAttribute('data-event-id');
      assert.ok(idBefore, 'chip must have data-event-id');
      const boxBefore = (await chip.boundingBox())!;
      assert.ok(boxBefore, 'chip must have a bounding box');

      // The resize handle is a 6px strip at the bottom of the chip. Aim for
      // chip bottom - 2px (inside the handle), then drag down ~90px (~110 min).
      const startX = boxBefore.x + boxBefore.width / 2;
      const startY = boxBefore.y + boxBefore.height - 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      const STEPS = 8;
      for (let i = 1; i <= STEPS; i++) {
        await page.mouse.move(startX, startY + (90 * i) / STEPS);
      }
      await page.mouse.up();
      await page.waitForTimeout(200);

      const boxAfter = (await chip.boundingBox())!;
      assert.ok(boxAfter, 'chip must still be in DOM after resize');
      assert.ok(
        boxAfter.height > boxBefore.height + 20,
        `chip should grow taller after resize: before=${boxBefore.height} after=${boxAfter.height}`,
      );
    });
  });

  test('MonthView: drag event between day cells reschedules it', async () => {
    await withBrowser(async (page) => {
      await switchView(page, 'month');
      // Ensure at least one event-chip is rendered in the month grid.
      let monthChips = await page.locator('.event-chip').count();
      if (monthChips === 0) {
        // Drop back to week, hotkey `n`, save, then re-switch.
        await switchView(page, 'week');
        await page.keyboard.press('n');
        const e = await page
          .waitForSelector('input[placeholder="Add title"]', { timeout: 1500 })
          .catch(() => null);
        if (e) {
          await e.fill('SAM-60 month seed');
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
        await switchView(page, 'month');
        monthChips = await page.locator('.event-chip').count();
      }
      assert.ok(monthChips > 0, 'need at least one month chip to drag');

      const chip = page.locator('.event-chip').first();
      const title = (await chip.getAttribute('aria-label')) || '';
      const boxA = (await chip.boundingBox())!;
      assert.ok(boxA, 'month chip must have a bounding box');

      // Drag the chip horizontally to the next-day cell (~+150 px). The drag
      // is handled by onPointerEnter on each cell — so we need to step through.
      const startX = boxA.x + boxA.width / 2;
      const startY = boxA.y + boxA.height / 2;
      const dx = 180;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      const STEPS = 10;
      for (let i = 1; i <= STEPS; i++) {
        await page.mouse.move(startX + (dx * i) / STEPS, startY);
      }
      await page.mouse.up();
      await page.waitForTimeout(300);

      // The chip should now live at a different x position. Find any chip with
      // the same aria-label (drag re-keys it under a new cell).
      const moved = page.locator(`[aria-label="${title}"]`).first();
      assert.ok(await moved.count() > 0, `chip ${title} should still be in the DOM`);
      const boxB = (await moved.boundingBox())!;
      assert.ok(boxB, 'moved chip must have a bounding box');
      assert.ok(
        Math.abs(boxB.x - boxA.x) > 50,
        `chip should have shifted horizontally: before x=${boxA.x.toFixed(1)} after x=${boxB.x.toFixed(1)}`,
      );
    });
  });
});
