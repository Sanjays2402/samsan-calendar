#!/usr/bin/env node
// Capture the three required screenshots for SAM-42 / SAM-63.
//
// Usage:
//   node scripts/capture-screenshots.mjs [--base http://127.0.0.1:5173] [--out design/screenshots]
//
// Writes:
//   design/screenshots/month-view-dark.png
//   design/screenshots/week-view-light.png
//   design/screenshots/event-editor.png
//
// Assumes a static preview / dev server is already serving the built app at --base.

import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}
const BASE = args.get('base') ?? 'http://127.0.0.1:5173';
const OUT_DIR = resolve(args.get('out') ?? 'design/screenshots');

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

async function ensureOutDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function bootContext(browser, { theme }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: theme === 'light' ? 'light' : 'dark',
  });
  // Pre-seed localStorage so the app boots in the right theme immediately.
  await ctx.addInitScript(({ theme }) => {
    try {
      localStorage.setItem('samsan.theme', theme);
    } catch {}
  }, { theme });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console.error]', msg.text());
  });
  return { ctx, page };
}

async function gotoApp(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // The "Today" button is always rendered by TopBar — use it as readiness signal.
  await page.getByRole('button', { name: /Go to today/i }).waitFor({ timeout: 10_000 });
  // Wait for the calendar surface to actually paint (no Loading… overlay).
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading…'),
    null,
    { timeout: 10_000 },
  );
  // Settle animations / fonts.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function setView(page, view) {
  // View segmented control is `role="tablist" aria-label="View"`.
  const label = { day: 'Day', week: 'Week', month: 'Month' }[view];
  const tab = page
    .getByRole('tablist', { name: 'View' })
    .getByRole('tab', { name: label });
  await tab.click();
  await page.waitForTimeout(200);
}

async function captureMonthDark(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try {
    await gotoApp(page);
    await setView(page, 'month');
    const out = join(OUT_DIR, 'month-view-dark.png');
    await ensureOutDir(out);
    await page.screenshot({ path: out, type: 'png' });
    console.log('  ✓', out);
  } finally {
    await ctx.close();
  }
}

async function captureWeekLight(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'light' });
  try {
    await gotoApp(page);
    await setView(page, 'week');
    // Snap a couple of frames in so any view-transition animation settles.
    await page.waitForTimeout(300);
    const out = join(OUT_DIR, 'week-view-light.png');
    await ensureOutDir(out);
    await page.screenshot({ path: out, type: 'png' });
    console.log('  ✓', out);
  } finally {
    await ctx.close();
  }
}

async function captureEventEditor(browser) {
  const { ctx, page } = await bootContext(browser, { theme: 'dark' });
  try {
    await gotoApp(page);
    await setView(page, 'week');
    await page.waitForTimeout(150);
    // Open the editor via the "New" button — guaranteed to seed a draft event.
    await page.getByRole('button', { name: 'New event (n)' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit event' });
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(200);

    const out = join(OUT_DIR, 'event-editor.png');
    await ensureOutDir(out);

    const box = await editor.boundingBox();
    if (box) {
      const pad = 28;
      const clip = {
        x: Math.max(0, Math.floor(box.x - pad)),
        y: Math.max(0, Math.floor(box.y - pad)),
        width: Math.min(
          VIEWPORT.width - Math.max(0, Math.floor(box.x - pad)),
          Math.ceil(box.width + pad * 2),
        ),
        height: Math.min(
          VIEWPORT.height - Math.max(0, Math.floor(box.y - pad)),
          Math.ceil(box.height + pad * 2),
        ),
      };
      await page.screenshot({ path: out, type: 'png', clip });
      console.log('  ✓', out, '(clipped to editor)');
    } else {
      await page.screenshot({ path: out, type: 'png' });
      console.log('  ✓', out, '(viewport fallback)');
    }
  } finally {
    await ctx.close();
  }
}

(async () => {
  console.log(`base: ${BASE}`);
  console.log(`out:  ${OUT_DIR}`);
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  try {
    await captureMonthDark(browser);
    await captureWeekLight(browser);
    await captureEventEditor(browser);
  } finally {
    await browser.close();
  }
  console.log('done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
