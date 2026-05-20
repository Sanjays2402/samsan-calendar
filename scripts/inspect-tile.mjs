import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })).newPage();
await p.goto('http://localhost:5173');
await p.waitForLoadState('networkidle').catch(()=>{});
await p.keyboard.press('w');
await p.waitForTimeout(400);
const info = await p.evaluate(() => {
  const tile = document.querySelector('.event-tile');
  if (!tile) return null;
  const cs = getComputedStyle(tile);
  return {
    classList: tile.className,
    inlineStyle: tile.getAttribute('style'),
    bs: cs.boxShadow,
    bsVar: cs.getPropertyValue('--tile-ring'),
    tr: cs.transition,
    bg: cs.backgroundColor,
    cur: cs.cursor,
  };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
