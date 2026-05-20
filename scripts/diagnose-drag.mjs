#!/usr/bin/env node
// Diagnose: is data-dragging actually being set during a drag?
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle').catch(() => {});
await page.keyboard.press('w');
await page.waitForTimeout(400);

const tile = page.locator('.event-tile').filter({ hasText: 'Standup' }).first();
const box = await tile.boundingBox();
console.log('tile box:', box);

// dispatch pointer events (mouse fallback) — capture mid-drag
await page.mouse.move(box.x + 20, box.y + 8);
await page.mouse.down();
await page.mouse.move(box.x + 20, box.y + 30, { steps: 4 });
await page.mouse.move(box.x + 20, box.y + 60, { steps: 4 });
await page.waitForTimeout(100);

// Now query all .event-tile elements and report attributes + computed shadow
const info = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.event-tile')];
  return tiles
    .map((el, i) => ({
      i,
      title: (el.querySelector('div')?.textContent || '').slice(0, 40),
      dragging: el.getAttribute('data-dragging'),
      selected: el.getAttribute('data-selected'),
      bs: getComputedStyle(el).boxShadow,
      op: getComputedStyle(el).opacity,
      tr: getComputedStyle(el).transform,
    }))
    .filter((x) => x.dragging || x.selected)
    .slice(0, 5);
});
console.log('mid-drag matches:', JSON.stringify(info, null, 2));

await page.mouse.up();
await browser.close();
