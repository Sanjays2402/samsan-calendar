import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const dlDir = '/tmp/sam62-dl';
await fs.rm(dlDir, { recursive: true, force: true });
await fs.mkdir(dlDir, { recursive: true });

const ctx = await chromium.launch({ headless: true });
const browserCtx = await ctx.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await browserCtx.newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Trigger Cmd+E to download .ics
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.keyboard.press('Meta+e'),
]);

const dest = path.join(dlDir, download.suggestedFilename());
await download.saveAs(dest);
console.log('SAVED', dest);
const ics = await fs.readFile(dest, 'utf8');
console.log('---ICS HEAD---');
console.log(ics.split('\n').slice(0, 30).join('\n'));
console.log('---STATS---');
console.log('lines:', ics.split('\n').length, 'events:', (ics.match(/BEGIN:VEVENT/g) || []).length);
await ctx.close();
