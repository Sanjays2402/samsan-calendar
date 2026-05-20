/**
 * Capture SAM-70 evidence shots:
 *   1. Recurrence picker open inside the event editor
 *   2. Recurring-series chips spread across the week view
 *   3. Agenda view showing daily / weekly repetition badges
 *
 * Assumes the dev server is up at http://localhost:5173/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'design/screenshots/sam-70';
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

async function shot(name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  console.log('captured', dest);
}

async function clearStorage() {
  await page.context().clearCookies();
  await page.evaluate(async () => {
    try {
      const dbs = await indexedDB.databases();
      for (const { name } of dbs) {
        if (name) await new Promise((r) => indexedDB.deleteDatabase(name).addEventListener('blocked', r) ?? r());
      }
    } catch (e) {
      console.warn('idb clear', e);
    }
    localStorage.clear();
  });
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await clearStorage();
await page.reload({ waitUntil: 'networkidle' });
// Wait long enough for hydrate + seed to settle.
await page.waitForTimeout(900);

// ---- 1. Week view: recurring series fanout ---------------------------------
await page.keyboard.press('w');
await page.waitForTimeout(300);
await shot('01-week-recurring-series.png');

// ---- 2. Agenda view ---------------------------------------------------------
await page.keyboard.press('a');
await page.waitForTimeout(300);
await shot('02-agenda-recurring.png');

// ---- 3. Recurrence picker open inside EventEditor ---------------------------
await page.keyboard.press('w');
await page.waitForTimeout(200);
// Press `n` to create a fresh event at cursor — opens editor reliably.
await page.keyboard.press('n');
await page.waitForTimeout(500);
const recurSelect = page.locator('select[aria-label="Recurrence preset"]');
await recurSelect.waitFor({ state: 'visible', timeout: 5000 });
// Pre-pick "Weekly" so the preview text + custom input are showing.
await recurSelect.selectOption({ label: 'Every weekday (Mon–Fri)' });
await page.waitForTimeout(200);
await shot('03-event-editor-recur.png');

await browser.close();
console.log('SAM-70 screenshots written to', OUT);
