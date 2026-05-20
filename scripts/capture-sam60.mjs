#!/usr/bin/env node
// SAM-60 — capture day / week / month / agenda views + drag interactions.
//
// Usage:
//   node scripts/capture-sam60.mjs [--base http://127.0.0.1:5173] [--out design/screenshots/sam-60]

import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}
const BASE = args.get('base') ?? 'http://localhost:5173';
const OUT_DIR = resolve(args.get('out') ?? 'design/screenshots/sam-60');

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

async function ensure(p) {
  await mkdir(dirname(p), { recursive: true });
}

async function bootContext(browser, { theme }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: theme === 'light' ? 'light' : 'dark',
  });
  await ctx.addInitScript(({ theme }) => {
    try { localStorage.setItem('samsan.theme', theme); } catch {}
  }, { theme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  return { ctx, page };
}

async function ready(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Go to today/i }).waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading…'), null, { timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function setView(page, view) {
  const label = { day: 'Day', week: 'Week', month: 'Month', agenda: 'Agenda' }[view];
  const tab = page.getByRole('tablist', { name: 'View' }).getByRole('tab', { name: label });
  await tab.click();
  await page.waitForTimeout(350);
}

async function shoot(page, name) {
  const out = join(OUT_DIR, `${name}.png`);
  await ensure(out);
  await page.screenshot({ path: out, type: 'png' });
  console.log('  ✓', out);
}

async function dayView(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try { await ready(page); await setView(page, 'day'); await shoot(page, 'day-view-dark'); }
  finally { await ctx.close(); }
}

async function weekView(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'light' });
  try { await ready(page); await setView(page, 'week'); await shoot(page, 'week-view-light'); }
  finally { await ctx.close(); }
}

async function monthView(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try { await ready(page); await setView(page, 'month'); await shoot(page, 'month-view-dark'); }
  finally { await ctx.close(); }
}

async function agendaView(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'light' });
  try { await ready(page); await setView(page, 'agenda'); await shoot(page, 'agenda-view-light'); }
  finally { await ctx.close(); }
}

async function dragCreate(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try {
    await ready(page);
    await setView(page, 'week');
    // Find the day grid (role=grid name like "Week of …" or use class selector).
    const grid = page.locator('[data-testid="time-grid"]').first();
    await grid.waitFor({ state: 'visible', timeout: 5_000 });
    const box = await grid.boundingBox();
    if (!box) { await shoot(page, 'drag-create-fallback'); return; }
    // Pick an empty-ish slot in the first day column — mid-grid is usually free.
    const colWidth = box.width / 7; // week view = 7 day cols
    const startX = box.x + colWidth * 1.5; // second column, center
    const startY = box.y + 400; // mid-grid (~8am with scroll)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 72, { steps: 10 });
    // Mid-drag screenshot to show CreateGhost.
    await shoot(page, 'drag-create-week');
    await page.mouse.up();
    await page.waitForTimeout(300);
    // After release the editor may have opened — capture the result.
    await shoot(page, 'drag-create-week-after');
  } finally {
    await ctx.close();
  }
}

async function commandPalette(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try {
    await ready(page);
    await setView(page, 'week');
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(250);
    await shoot(page, 'command-palette-dark');
    // Type a query to show fuzzy match.
    await page.keyboard.type('tomorrow lunch');
    await page.waitForTimeout(300);
    await shoot(page, 'command-palette-query');
  } finally {
    await ctx.close();
  }
}

async function eventEditor(browser) {
  // Required deliverable on parent SAM-42: event-editor.png.
  // Opens the editor by focusing an event tile and pressing Enter — clicking a
  // tile triggers pointerdown/up which the move-drag handler treats as a click
  // only after pointer-capture release, so keyboard activation is more
  // deterministic for headless playback.
  const { ctx, page } = await bootContext(browser, { theme: 'light' });
  try {
    await ready(page);
    await setView(page, 'week');
    const tile = page.locator('.event-tile').first();
    await tile.waitFor({ state: 'visible', timeout: 5_000 });
    await tile.focus();
    await tile.press('Enter');
    await page.waitForSelector('[role="dialog"][aria-label="Edit event"]', {
      timeout: 5_000,
    });
    await page.waitForTimeout(350); // editor fade-in
    await shoot(page, 'event-editor');
  } finally {
    await ctx.close();
  }
}

(async () => {
  console.log(`base: ${BASE}`);
  console.log(`out:  ${OUT_DIR}`);
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  try {
    await dayView(browser);
    await weekView(browser);
    await monthView(browser);
    await agendaView(browser);
    await dragCreate(browser);
    await commandPalette(browser);
    await eventEditor(browser);
  } finally {
    await browser.close();
  }
  console.log('done.');
})().catch((e) => { console.error(e); process.exit(1); });
