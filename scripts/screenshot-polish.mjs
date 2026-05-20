#!/usr/bin/env node
/**
 * SAM-64 visual proof — capture rest / hover / dragging / month-chip states.
 *
 * Drives Playwright against the running `pnpm dev` server. Writes PNGs into
 * design/screenshots/sam-64/*.png.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'design', 'screenshots', 'sam-64');
await mkdir(outDir, { recursive: true });

const URL = process.env.URL ?? 'http://localhost:5173';

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);
}

async function shot(page, name) {
  const p = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: p });
  console.log(`✓ ${p}`);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await settle(page);

  // ── 1. Week view, all rest
  await page.keyboard.press('w');
  await settle(page);
  await shot(page, '01-week-rest');

  // ── 2. Week view, single event hovered → tighter ring + 0.5px lift
  const firstEventTile = page.locator('.event-tile').filter({ hasText: 'Standup' }).first();
  await firstEventTile.hover();
  await page.waitForTimeout(200); // let 150ms transition land
  await shot(page, '02-week-hover');

  // ── 3. Week view, event selected (clicked) → accent ring
  // Move pointer away so the hover overlay doesn't compound.
  await page.mouse.move(20, 20);
  await page.waitForTimeout(150);
  await firstEventTile.click({ position: { x: 4, y: 4 }, force: true });
  await page.keyboard.press('Escape'); // close any popover but keep selection
  await page.waitForTimeout(200);
  await shot(page, '03-week-selected');

  // ── 4. Week view, mid-drag → drop shadow + scale + opacity (data-dragging)
  // Use raw mouse so we go through pointerdown without releasing.
  const box = await firstEventTile.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 20, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + 60, { steps: 8 });
    await page.waitForTimeout(180);
    await shot(page, '04-week-dragging');
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  // ── 5. Month view, chip hover
  await page.keyboard.press('m');
  await settle(page);
  await shot(page, '05-month-rest');

  const monthChip = page.locator('.event-chip').first();
  await monthChip.hover();
  await page.waitForTimeout(200);
  await shot(page, '06-month-hover');

  // ── 6. Month chip drag
  const cbox = await monthChip.boundingBox();
  if (cbox) {
    await page.mouse.move(cbox.x + 10, cbox.y + 8);
    await page.mouse.down();
    await page.mouse.move(cbox.x + 10, cbox.y + 8); // ensure data-dragging flips
    await page.mouse.move(cbox.x + 90, cbox.y + 60, { steps: 8 });
    await page.waitForTimeout(180);
    await shot(page, '07-month-dragging');
    await page.mouse.up();
  }

  // ── 7. Light theme rest (sanity)
  const ctxLight = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const lp = await ctxLight.newPage();
  await lp.goto(URL);
  await settle(lp);
  await lp.keyboard.press('w');
  await settle(lp);
  await shot(lp, '08-light-week-rest');
  const lightHover = lp.locator('.event-tile').first();
  await lightHover.hover();
  await lp.waitForTimeout(200);
  await shot(lp, '09-light-week-hover');
  await ctxLight.close();
} finally {
  await browser.close();
}
console.log('done');
