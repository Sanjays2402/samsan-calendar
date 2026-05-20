import { chromium } from 'playwright';
const ctx = await chromium.launch({ headless: true });
const page = await (await ctx.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Switch to week, count events
await page.keyboard.press('w');
await page.waitForTimeout(400);
const before = await page.locator('[data-event-id]').count();
console.log('events before:', before);

// Create a new event at cursor (press n)
await page.keyboard.press('n');
await page.waitForTimeout(400);

// EventEditor should be open; press Esc to commit/close (or save)
// Inspect what dialog is showing
const editorOpen = await page.locator('[role="dialog"]').count();
console.log('dialogs after n:', editorOpen);

// Save the draft → press Cmd+Enter or click Save button
const saveBtn = page.locator('button:has-text("Save")');
if (await saveBtn.count()) {
  await saveBtn.first().click();
  await page.waitForTimeout(400);
}

const afterCreate = await page.locator('[data-event-id]').count();
console.log('events after create:', afterCreate);

// Undo
await page.keyboard.press('Meta+z');
await page.waitForTimeout(400);
const afterUndo = await page.locator('[data-event-id]').count();
console.log('events after undo:', afterUndo);

// Redo
await page.keyboard.press('Meta+Shift+z');
await page.waitForTimeout(400);
const afterRedo = await page.locator('[data-event-id]').count();
console.log('events after redo:', afterRedo);

await ctx.close();
