import { chromium } from 'playwright';
const OUT = '/Users/sanjay/Projects/samsan-calendar/design/screenshots/sam-62';
const ctx = await chromium.launch({ headless: true });
const page = await (await ctx.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1. Dashboard with month view (default)
await page.screenshot({ path: `${OUT}/01-month-view.png`, fullPage: false });

// 2. Open command palette
await page.keyboard.press('Meta+k');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02-palette-empty.png`, fullPage: false });

// 3. Type a search → "stand" (matches the Standup seed event)
await page.keyboard.type('stand');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-palette-fuzzy-stand.png`, fullPage: false });

// 4. Clear + try "tomorrow" — NL date
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Meta+k');
await page.waitForTimeout(300);
await page.keyboard.type('next friday 2pm');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-palette-nl-date.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 5. Help sheet
await page.keyboard.press('?');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-help-sheet.png`, fullPage: false });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 6. Week view (press 'w')
await page.keyboard.press('w');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/06-week-view.png`, fullPage: false });

// 7. Agenda view
await page.keyboard.press('a');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-agenda-view.png`, fullPage: false });

// 8. Light theme — open palette → search "light"
await page.keyboard.press('Meta+k');
await page.waitForTimeout(300);
await page.keyboard.type('light');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.keyboard.press('m'); // back to month
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/08-month-light.png`, fullPage: false });

await ctx.close();
console.log('OK');
