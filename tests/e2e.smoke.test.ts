/**
 * SAM-62 end-to-end smoke: prove the polish bundle actually wires up in the
 * browser, not just in tests. Drives a real Chromium against `pnpm dev` and
 * exercises:
 *
 *   - Cmd/Ctrl+K opens the command palette
 *   - `?` opens the keyboard help sheet
 *   - `n` creates a draft event (editor opens with an input)
 *   - Cmd/Ctrl+Z undoes the create (event disappears)
 *   - Cmd/Ctrl+E downloads a .ics file containing real VEVENT lines
 *
 * The dev server must be running on localhost:5173 before you run this
 * (the test does NOT spin Vite itself — that's what `make dev` is for).
 */
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { chromium, type Download } from 'playwright';

const URL = 'http://localhost:5173/';

async function withBrowser<T>(fn: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    // App hydrates from IDB on first paint; the topbar is the most reliable signal.
    await page.waitForSelector('[data-testid="topbar"], header, nav, h1, button', {
      timeout: 5000,
    });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

describe('SAM-62: command palette + shortcuts + undo + .ics', () => {
  test('Cmd+K opens the command palette', async () => {
    await withBrowser(async (page) => {
      await page.keyboard.press('Meta+K');
      const dialog = await page.waitForSelector('[role="dialog"][aria-label="Command palette"]', {
        timeout: 2000,
      });
      assert.ok(dialog, 'palette dialog should mount');
      // The palette auto-focuses on a 30ms setTimeout after mount — wait for it
      // to settle before we read activeElement.
      await page.waitForFunction(() => document.activeElement?.tagName === 'INPUT', null, {
        timeout: 1000,
      });
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      assert.equal(focusedTag, 'INPUT', 'palette input should auto-focus');
      // Esc should close it.
      await page.keyboard.press('Escape');
      const closed = await page
        .waitForSelector('[role="dialog"][aria-label="Command palette"]', {
          state: 'detached',
          timeout: 2000,
        })
        .then(() => true)
        .catch(() => false);
      assert.ok(closed, 'palette should close on Escape');
    });
  });

  test('"?" opens the keyboard shortcut help sheet', async () => {
    await withBrowser(async (page) => {
      await page.keyboard.press('Shift+/');
      const sheet = await page
        .waitForSelector('[role="dialog"]:has-text("Keyboard")', { timeout: 2000 })
        .catch(() => null);
      assert.ok(sheet, 'help sheet should open');
      await page.keyboard.press('Escape');
    });
  });

  test('"n" creates an event and Cmd+Z undoes it', async () => {
    await withBrowser(async (page) => {
      // Read the current event count from the store before we touch anything.
      const before = await page.evaluate(() => {
        const w = window as unknown as { __samsanState?: () => number };
        if (w.__samsanState) return w.__samsanState();
        // Fallback: query rendered chips.
        return document.querySelectorAll('[data-event-id]').length;
      });

      await page.keyboard.press('n');
      // Editor mounts an inline title input with placeholder "Add title".
      const editorInput = await page
        .waitForSelector('input[placeholder="Add title"]', { timeout: 2000 })
        .catch(() => null);
      assert.ok(editorInput, 'editor input should appear after "n"');

      // Type a title and press Enter — this routes through commitAndClose()
      // which writes the event to IDB + the store, then closes the editor.
      await editorInput!.fill('SAM-62 smoke');
      await page.keyboard.press('Enter');

      // Now there should be one more event. Read via DOM (chips/labels).
      await page.waitForTimeout(400);
      const afterCreate = await page.locator('text=SAM-62 smoke').count();
      assert.ok(afterCreate >= 1, 'event chip "SAM-62 smoke" should render after create');

      // Undo with Cmd+Z and verify the chip disappears.
      await page.keyboard.press('Meta+Z');
      await page.waitForTimeout(400);
      const afterUndo = await page.locator('text=SAM-62 smoke').count();
      assert.equal(afterUndo, 0, 'event chip should disappear after Cmd+Z');

      void before;
    });
  });

  test('Cmd+E exports a valid .ics file', async () => {
    await withBrowser(async (page) => {
      // Wait for hydrate() to seed and render at least one event chip — without
      // events the export is a no-op and the test races into a timeout.
      await page.waitForFunction(
        () => document.querySelectorAll('[data-event-id], .event-chip').length > 0,
        null,
        { timeout: 5000 },
      ).catch(() => {/* fall through — we'll still try the shortcut */});

      const downloadPromise: Promise<Download> = page.waitForEvent('download', { timeout: 5000 });
      await page.keyboard.press('Meta+E');
      const dl = await downloadPromise;
      assert.match(dl.suggestedFilename(), /\.ics$/, 'download should have .ics extension');
      const path = await dl.path();
      assert.ok(path, 'downloaded file should be saved');
      const { readFileSync } = await import('node:fs');
      const ics = readFileSync(path!, 'utf-8');
      assert.match(ics, /^BEGIN:VCALENDAR/m, 'ICS should start with VCALENDAR');
      assert.match(ics, /BEGIN:VEVENT/, 'ICS should contain at least one VEVENT');
      assert.match(ics, /END:VCALENDAR/, 'ICS should end with VCALENDAR');
    });
  });
});
