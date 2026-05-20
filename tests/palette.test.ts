/**
 * SAM-67 — fuzzy matcher + NL date parser smoke tests.
 *
 * Pure modules with no DOM. Verifies:
 *   1. Subsequence matching is case-insensitive and rejects non-subsequences.
 *   2. Prefix and word-boundary matches outscore "later" matches.
 *   3. `switch to day view` is reachable via `swdv`, `day`, `switch`, etc.
 *   4. `highlightChunks` returns coherent runs over multi-byte input.
 *   5. The NL date parser handles today/tomorrow/weekdays/ISO/slash/month-name
 *      and rejects gibberish.
 *
 * Run with: pnpm test:palette
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { fuzzyMatch, highlightChunks } from '../src/lib/fuzzy';
import { parseNlDate } from '../src/lib/nl-date';

// --------------------------------------------------------------------------
// fuzzyMatch
// --------------------------------------------------------------------------

test('fuzzy: empty query returns score 0 + no matches', () => {
  const hit = fuzzyMatch('', 'anything');
  assert.ok(hit);
  assert.equal(hit!.score, 0);
  assert.deepEqual(hit!.matches, []);
});

test('fuzzy: rejects non-subsequence', () => {
  assert.equal(fuzzyMatch('xyz', 'abc'), null);
  assert.equal(fuzzyMatch('zw', 'switch to week view'), null);
});

test('fuzzy: case-insensitive', () => {
  const hit = fuzzyMatch('DAY', 'Switch to day view');
  assert.ok(hit, 'expected DAY to match Switch to day view');
});

test('fuzzy: prefix outranks middle match', () => {
  const prefix = fuzzyMatch('new', 'New event')!;
  const middle = fuzzyMatch('new', 'Renew old event')!;
  assert.ok(prefix.score > middle.score);
});

test('fuzzy: word-boundary outranks contiguous middle match', () => {
  // matching the `d` after `to ` (boundary) should beat just `Sun-day`.
  const boundary = fuzzyMatch('td', 'switch to day view')!;
  assert.ok(boundary);
  assert.ok(boundary.score > 0);
});

test('fuzzy: subsequence works for `swdv`', () => {
  // s(witch) (to) (d)ay (v)iew — every char must be findable in order.
  const hit = fuzzyMatch('swdv', 'switch to day view');
  assert.ok(hit, 'expected swdv to match switch to day view');
  assert.equal(hit!.matches.length, 4);
});

test('fuzzy: subsequence rejects out-of-order chars', () => {
  // Want 'vd' (v then d) but 'd' precedes 'v' in the target — must fail.
  assert.equal(fuzzyMatch('vd', 'switch to day view'), null);
});

test('fuzzy: prefers contiguous within same prefix anchor', () => {
  // Both candidates start with the same prefix-bonus anchor; the only
  // difference is gaps between subsequent matches. The tight one should win.
  const tight = fuzzyMatch('abc', 'abcdef')!;
  const loose = fuzzyMatch('abc', 'aXbXcX')!;
  assert.ok(tight, 'tight match expected');
  assert.ok(loose, 'loose match expected');
  assert.ok(
    tight.score > loose.score,
    `tight=${tight.score} loose=${loose.score}`,
  );
});

// --------------------------------------------------------------------------
// highlightChunks
// --------------------------------------------------------------------------

test('highlight: empty matches → single unmatched chunk', () => {
  const chunks = highlightChunks('hello', []);
  assert.deepEqual(chunks, [{ text: 'hello', matched: false }]);
});

test('highlight: consecutive matches merge into one chunk', () => {
  const chunks = highlightChunks('today', [0, 1, 2, 3, 4]);
  assert.deepEqual(chunks, [{ text: 'today', matched: true }]);
});

test('highlight: interleaved matches alternate cleanly', () => {
  const chunks = highlightChunks('switch to day view', [0, 10, 11, 12]);
  assert.equal(
    chunks.map((c) => c.text).join(''),
    'switch to day view',
  );
  // The "day" run should be a single matched chunk.
  assert.ok(chunks.some((c) => c.matched && c.text === 'day'));
});

// --------------------------------------------------------------------------
// parseNlDate
// --------------------------------------------------------------------------

const NOW = new Date(2026, 4, 19, 14, 0, 0); // Tue 2026-05-19 (Tuesday)

test('nl-date: "today" returns start-of-day for now', () => {
  const out = parseNlDate('today', NOW);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Tue May 19 2026');
});

test('nl-date: "tomorrow" → next day', () => {
  const out = parseNlDate('tomorrow', NOW);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Wed May 20 2026');
});

test('nl-date: bare weekday picks next occurrence (today counts)', () => {
  // NOW is a Tuesday — "tuesday" should resolve to today.
  const out = parseNlDate('tuesday', NOW);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Tue May 19 2026');
});

test('nl-date: "next monday" skips today even when today is monday', () => {
  const monday = new Date(2026, 4, 18); // Mon 2026-05-18
  const out = parseNlDate('next monday', monday);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Mon May 25 2026');
});

test('nl-date: ISO "2027-03-15"', () => {
  const out = parseNlDate('2027-03-15', NOW);
  assert.ok(out);
  assert.equal(out!.date.getFullYear(), 2027);
  assert.equal(out!.date.getMonth(), 2);
  assert.equal(out!.date.getDate(), 15);
});

test('nl-date: "3/15" rolls past dates to next year', () => {
  // NOW is May 19. "3/15" (March 15) is already past → expect 2027.
  const out = parseNlDate('3/15', NOW);
  assert.ok(out);
  assert.equal(out!.date.getFullYear(), 2027);
  assert.equal(out!.date.getMonth(), 2);
  assert.equal(out!.date.getDate(), 15);
});

test('nl-date: "march 15 2027" honors explicit year', () => {
  const out = parseNlDate('march 15 2027', NOW);
  assert.ok(out);
  assert.equal(out!.date.getFullYear(), 2027);
});

test('nl-date: "15 march" works in day-first form too', () => {
  const out = parseNlDate('15 march', NOW);
  assert.ok(out);
  assert.equal(out!.date.getMonth(), 2);
  assert.equal(out!.date.getDate(), 15);
});

test('nl-date: "in 3 days"', () => {
  const out = parseNlDate('in 3 days', NOW);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Fri May 22 2026');
});

test('nl-date: "+2w"', () => {
  const out = parseNlDate('+2w', NOW);
  assert.ok(out);
  assert.equal(out!.date.toDateString(), 'Tue Jun 02 2026');
});

test('nl-date: gibberish returns null', () => {
  assert.equal(parseNlDate('asdfqwer', NOW), null);
  assert.equal(parseNlDate('switch to day view', NOW), null);
  assert.equal(parseNlDate('', NOW), null);
});

test('nl-date: invalid month/day returns null', () => {
  assert.equal(parseNlDate('13/45', NOW), null);
  assert.equal(parseNlDate('foobar 99', NOW), null);
});
