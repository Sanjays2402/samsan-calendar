/**
 * Subsequence fuzzy matcher (Sublime / Linear style).
 *
 * For each query character we must find an occurrence in the target, in
 * order. Among the many valid subsequences we pick the one with the best
 * score per the heuristics below:
 *
 *   - Prefix match.
 *   - Bonus for matches at word boundaries (after a space, `-`, `_`, `/`, `·`).
 *   - Bonus for consecutive matches (no gap).
 *   - Penalty for gaps between matched characters.
 *   - Penalty for how far past the start we had to walk to begin matching.
 *
 * Implementation: DP over (qi, ti). The strings are short — labels and
 * event titles — so we don't fret about the constant factors.
 */

export type FuzzyHit = {
  score: number;
  /** Indices into the original target string of the matched characters. */
  matches: number[];
};

const PREFIX_BONUS = 80;
const WORD_BOUNDARY_BONUS = 24;
const CONSECUTIVE_BONUS = 14;
const GAP_PENALTY = -2;
const LEADING_PENALTY = -1;
const NEG_INF = -1e9;

function isBoundaryChar(ch: string | undefined): boolean {
  if (ch === undefined) return true;
  return ch === ' ' || ch === '-' || ch === '_' || ch === '/' || ch === '·';
}

/**
 * Score the *single* match at `targetIdx` given the previous matched index
 * (`prevIdx`, or -1 if this is the first matched character) and whether
 * this is the very first query character (qi === 0).
 */
function scoreMatch(
  targetIdx: number,
  prevIdx: number,
  qi: number,
  target: string,
): number {
  let s = 0;
  if (qi === 0) {
    if (targetIdx === 0) s += PREFIX_BONUS;
    s += LEADING_PENALTY * Math.min(targetIdx, 12);
  }
  // Word-boundary bonus uses the original-case target so unicode-y separators
  // like `·` survive the lower-casing.
  const prevCh = targetIdx > 0 ? target[targetIdx - 1] : undefined;
  if (isBoundaryChar(prevCh)) s += WORD_BOUNDARY_BONUS;
  if (prevIdx >= 0) {
    const gap = targetIdx - prevIdx - 1;
    if (gap === 0) s += CONSECUTIVE_BONUS;
    else s += GAP_PENALTY * Math.min(gap, 8);
  }
  return s;
}

/**
 * Match `query` against `target`. Returns `null` if `query` is not a
 * subsequence of `target` (case-insensitive). Empty query → score 0.
 */
export function fuzzyMatch(query: string, target: string): FuzzyHit | null {
  if (!query) return { score: 0, matches: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const qLen = q.length;
  const tLen = t.length;

  // dp[qi][ti] = best score matching q[qi..] against t[ti..]
  // pick[qi][ti] = the chosen ti index for q[qi] in the optimal path, or -1 if none.
  // We also need to know prevIdx when scoring — propagate it forward instead.
  //
  // Simpler: forward DP. best[ti] = best score for matching q[0..qi]
  // ending exactly at target index ti, and prev[ti] = the predecessor target
  // index. We walk qi = 0..qLen-1, ti = 0..tLen-1.

  // best[ti] = best score for the subsequence ending at ti for the current qi.
  // bestPrev[ti] = predecessor ti for backtracking.
  let bestPrev: number[] = new Array(tLen).fill(-2);
  let best: number[] = new Array(tLen).fill(NEG_INF);

  // qi = 0: each ti where t[ti] === q[0] is a valid start.
  const c0 = q.charCodeAt(0);
  for (let ti = 0; ti < tLen; ti += 1) {
    if (t.charCodeAt(ti) === c0) {
      best[ti] = scoreMatch(ti, -1, 0, target);
      bestPrev[ti] = -1;
    }
  }

  // Predecessor tables for each layer, so we can rebuild the path.
  const layers: number[][] = [bestPrev.slice()];

  for (let qi = 1; qi < qLen; qi += 1) {
    const ch = q.charCodeAt(qi);
    const nextBest: number[] = new Array(tLen).fill(NEG_INF);
    const nextPrev: number[] = new Array(tLen).fill(-2);

    for (let ti = 0; ti < tLen; ti += 1) {
      if (t.charCodeAt(ti) !== ch) continue;
      // Scan every predecessor tj < ti. The gap/consecutive bonus depends
      // on tj, so we cannot reduce this to a single running best.
      let bestHere = NEG_INF;
      let bestPredTi = -1;
      for (let tj = 0; tj < ti; tj += 1) {
        const prevScore = best[tj]!;
        if (prevScore <= NEG_INF) continue;
        const candidate = prevScore + scoreMatch(ti, tj, qi, target);
        if (candidate > bestHere) {
          bestHere = candidate;
          bestPredTi = tj;
        }
      }
      if (bestHere > NEG_INF) {
        nextBest[ti] = bestHere;
        nextPrev[ti] = bestPredTi;
      }
    }

    best = nextBest;
    bestPrev = nextPrev;
    layers.push(bestPrev.slice());

    // Quick reject: if every score is -inf, no subsequence exists.
    let anyAlive = false;
    for (let ti = 0; ti < tLen; ti += 1) {
      if (best[ti]! > NEG_INF) {
        anyAlive = true;
        break;
      }
    }
    if (!anyAlive) return null;
  }

  // Pick the best terminal position.
  let bestScore = NEG_INF;
  let bestTi = -1;
  for (let ti = 0; ti < tLen; ti += 1) {
    if (best[ti]! > bestScore) {
      bestScore = best[ti]!;
      bestTi = ti;
    }
  }
  if (bestTi === -1) return null;

  // Backtrack through layers to reconstruct match indices.
  const matches: number[] = [];
  let ti = bestTi;
  for (let qi = qLen - 1; qi >= 0; qi -= 1) {
    matches.push(ti);
    if (qi === 0) break;
    ti = layers[qi]![ti]!;
  }
  matches.reverse();

  return { score: bestScore, matches };
}

/**
 * Render helper: split a string into `{ text, matched }` chunks so the UI
 * can bold the matched characters without rebuilding the rendering loop.
 */
export function highlightChunks(
  text: string,
  matches: number[],
): Array<{ text: string; matched: boolean }> {
  if (matches.length === 0) return [{ text, matched: false }];
  const out: Array<{ text: string; matched: boolean }> = [];
  let i = 0;
  let mi = 0;
  while (i < text.length) {
    if (mi < matches.length && matches[mi] === i) {
      let j = i;
      while (
        mi < matches.length &&
        matches[mi] === j &&
        j < text.length
      ) {
        j += 1;
        mi += 1;
      }
      out.push({ text: text.slice(i, j), matched: true });
      i = j;
    } else {
      const nextMatch = mi < matches.length ? matches[mi]! : text.length;
      out.push({ text: text.slice(i, nextMatch), matched: false });
      i = nextMatch;
    }
  }
  return out;
}
