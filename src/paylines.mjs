/**
 * paylines.mjs — multi-reel, multi-row, multi-payline slot evaluation and exact RTP, extending
 * `reels.mjs`'s single-symbol-per-reel spin to a full visible GRID (one column of `rows`
 * consecutive symbols per reel, read off a uniformly-random stop with wraparound — the standard
 * "weighted reel strip" model every real video slot uses) and `odds.mjs`'s exact-enumeration
 * discipline to a paytable with wilds, a scatter, and payline patterns.
 *
 * Added additively for Cowrie Casino's "Tideline Treasures" (5x3, 20-line, wild/scatter/free-spin/
 * progressive-jackpot slot) — nothing here changes `reels.mjs`'s or `odds.mjs`'s existing exports
 * or behavior, and `parlor-service`'s own three-reel single-line "Fair Spin" game (built on
 * `spinReels`/`symbolHitOdds`/`computeSlotRTP`) is untouched by this file's addition.
 *
 * The same kernel/game boundary `odds.mjs`'s own header states for `computeSlotRTP` holds here:
 * a paytable, a wild/scatter symbol name, and payline patterns are all GAME data, passed in by the
 * caller — this module owns only the grid mechanics (windowing a reel strip, walking a payline,
 * matching wild-substituted runs) and the exact enumeration that makes a multi-line RTP figure
 * auditable rather than asserted, the same "computed from the reel's own data" bar `symbolHitOdds`
 * already sets for a single reel.
 *
 * Exactness and tractability: `computeMultiLineSlotRTP` enumerates every reel-stop combination —
 * `product(reel.length for each reel)` outcomes, each equally likely (uniform stop, per
 * `spinReelWindow`'s own draw) — exactly evaluating every payline and the scatter pay for every
 * one. This is exact, not sampled, for any reel-strip-length product a caller keeps in the low
 * millions (a 5-reel machine with reels of roughly 16-24 symbols each — realistic physical/virtual
 * reel lengths — enumerates in a few million combinations, seconds of work, never a statistical
 * estimate). A caller reaching for reel lengths whose product is no longer tractable to enumerate
 * exactly is outside this function's honest scope and should say so, not silently switch to
 * sampling inside this module.
 */

function assertReel(reel, label = 'reel') {
  if (!Array.isArray(reel) || reel.length === 0) {
    throw new TypeError(`paylines: ${label} must be a non-empty array of symbol strings`);
  }
}

function assertReels(reels) {
  if (!Array.isArray(reels) || reels.length === 0) {
    throw new TypeError('paylines: reels must be a non-empty array of reel strips');
  }
  reels.forEach((r, i) => assertReel(r, `reels[${i}]`));
}

function assertRows(rows) {
  if (!Number.isInteger(rows) || rows < 1) {
    throw new RangeError(`paylines: rows must be a positive integer (got ${rows})`);
  }
}

function assertRng(rng) {
  if (typeof rng?.int !== 'function') {
    throw new TypeError('paylines: rng must be an Rng (see ./seed.mjs#seededStream)');
  }
}

function assertPaylines(paylinesSpec, reelCount, rows) {
  if (!Array.isArray(paylinesSpec) || paylinesSpec.length === 0) {
    throw new TypeError('paylines: paylines must be a non-empty array of row-index patterns');
  }
  paylinesSpec.forEach((pattern, i) => {
    if (!Array.isArray(pattern) || pattern.length !== reelCount) {
      throw new TypeError(`paylines: paylines[${i}] must have exactly ${reelCount} row indices (one per reel)`);
    }
    if (!pattern.every((row) => Number.isInteger(row) && row >= 0 && row < rows)) {
      throw new RangeError(`paylines: paylines[${i}] has a row index outside [0, ${rows - 1}]`);
    }
  });
}

// ── grid windowing ──────────────────────────────────────────────────────────────────────────

/** Pure: the `rows`-tall window of `reel` starting at `stop` (index 0 = top row), wrapping
 *  around the strip — the standard "weighted reel strip" read every real slot uses so a stop
 *  near the end of the strip still fills a full window. `stop` is not bounds-checked against
 *  `reel.length` beyond modulo wraparound, so a caller enumerating stops in `[0, reel.length)`
 *  (as `computeMultiLineSlotRTP` does) gets every reachable window exactly once. */
export function reelWindowAt(reel, stop, rows) {
  assertReel(reel);
  assertRows(rows);
  const n = reel.length;
  const normalizedStop = ((stop % n) + n) % n;
  const out = new Array(rows);
  for (let r = 0; r < rows; r++) out[r] = reel[(normalizedStop + r) % n];
  return out;
}

/** One uniformly-random `rows`-tall window of `reel`: every stop on the strip is equally likely
 *  (matching `reels.mjs#spinReel`'s own uniform draw), so a symbol's probability of landing at a
 *  given row of the window is exactly (occurrences of that symbol at that row-offset across every
 *  stop) / reel.length — the same auditable-by-construction guarantee `symbolHitOdds` gives a
 *  single-row reel. */
export function spinReelWindow(rng, reel, rows) {
  assertRng(rng);
  assertReel(reel);
  assertRows(rows);
  const stop = rng.int(0, reel.length - 1);
  return reelWindowAt(reel, stop, rows);
}

/** Spin every reel in `reels`, left to right from one `rng` stream (the same deterministic
 *  left-to-right order `reels.mjs#spinReels` uses), each producing its own `rows`-tall window.
 *  Returns the grid as `reels.length` columns, each an array of `rows` symbols top to bottom. */
export function spinGrid(rng, reels, rows) {
  assertRng(rng);
  assertReels(reels);
  assertRows(rows);
  return reels.map((reel) => spinReelWindow(rng, reel, rows));
}

// ── payline evaluation ──────────────────────────────────────────────────────────────────────

/**
 * Evaluate one payline against a grid. `pattern[i]` is the row (0-based, top to bottom) the
 * payline visits on reel `i`. Standard slot rule: a win is a run of matching symbols starting
 * from reel 0 (a payline never pays a run that starts anywhere but the leftmost reel) — wilds
 * (`opts.wilds`, a list of symbol names) substitute for any paying symbol; the scatter symbol
 * (`opts.scatter`) breaks a run wherever it appears on the line (scatter pays are counted
 * separately, anywhere on the grid — see `evaluateSpin`). An all-wild run pays under the `'wild'`
 * paytable entry if the caller's `paytable` defines one (Tideline Treasures does — see
 * `slots-rules.mts`); if it doesn't, an all-wild run simply pays nothing from this function (a
 * caller wanting the wild to always resolve to the best-paying substituted symbol instead should
 * pass a `paytable.wild` entry equal to its own top prize, not rely on a fallback here — no
 * hidden default paytable behavior).
 *
 * `paytable[symbol]` is `{ [count: number]: payoutMultiplier }` — count is the run length (from
 * `opts.minCount ?? 3` up to `reelCount`), multiplier is the payout per unit bet-per-line.
 * Returns `null` when no win (run shorter than the paytable's minimum count, or an anchor symbol
 * with no paytable entry at all).
 */
export function evaluateLine(grid, pattern, paytable, opts = {}) {
  const wildSet = new Set(opts.wilds ?? []);
  const scatter = opts.scatter ?? null;
  const minCount = opts.minCount ?? 3;
  const reelCount = grid.length;
  const symbolsOnLine = new Array(reelCount);
  for (let i = 0; i < reelCount; i++) symbolsOnLine[i] = grid[i][pattern[i]];

  let anchor = null;
  for (let i = 0; i < reelCount; i++) {
    const s = symbolsOnLine[i];
    if (s === scatter) break; // scatter breaks a line run wherever it appears
    if (!wildSet.has(s)) {
      anchor = s;
      break;
    }
  }
  if (anchor === null) {
    // The scan above only exits with `anchor` still null in two cases: every symbol up to the
    // break was wild (an all-wild run — pays under `paytable[symbolsOnLine[0]]`, e.g. `'wild'`,
    // if the caller's paytable defines one), or reel 0 itself is the scatter (no run at all
    // possible — the count recomputation below naturally zeroes this out, since a scatter symbol
    // is never itself in `wildSet` and `paytable` never defines an entry for it, see this
    // function's own header). Either way, `symbolsOnLine[0]` is the correct anchor to recount
    // from — no separate special case needed.
    anchor = symbolsOnLine[0];
  }

  let count = 0;
  for (let i = 0; i < reelCount; i++) {
    const s = symbolsOnLine[i];
    if (s === anchor || wildSet.has(s)) count += 1;
    else break;
  }
  const table = paytable[anchor];
  if (!table) return null;
  if (count < minCount) return null;
  const multiplier = table[count] ?? 0;
  if (!(multiplier > 0)) return null;
  return { symbol: anchor, count, multiplier };
}

/**
 * Evaluate every payline plus the scatter pay for one grid. `betPerLine` prices every payline
 * identically (the standard "N lines x bet-per-line" slot stake shape); `scatterPaytable`
 * (`{ [count: number]: payoutMultiplier }`, multiplier applied to `totalBet`, not `betPerLine` —
 * a scatter pay is conventionally sized to the whole spin's stake, matching real machines) is
 * optional — omit it for a paytable with no scatter pay at all (scatter still counted purely for
 * a free-spin trigger, see `slots-rules.mts`'s own scatter handling).
 */
export function evaluateSpin(grid, paylinesSpec, paytable, opts = {}) {
  const betPerLine = opts.betPerLine ?? 1;
  const totalBet = opts.totalBet ?? betPerLine * paylinesSpec.length;
  const scatter = opts.scatter ?? null;

  const lineWins = [];
  let lineTotal = 0;
  for (let i = 0; i < paylinesSpec.length; i++) {
    const win = evaluateLine(grid, paylinesSpec[i], paytable, opts);
    if (win) {
      const payout = win.multiplier * betPerLine;
      lineWins.push({ line: i, symbol: win.symbol, count: win.count, multiplier: win.multiplier, payout });
      lineTotal += payout;
    }
  }

  let scatterCount = 0;
  if (scatter !== null) {
    for (const column of grid) {
      for (const s of column) {
        if (s === scatter) scatterCount += 1;
      }
    }
  }
  let scatterPayout = 0;
  if (opts.scatterPaytable && scatterCount > 0) {
    const multiplier = opts.scatterPaytable[scatterCount] ?? 0;
    scatterPayout = multiplier * totalBet;
  }

  return { lineWins, lineTotal, scatterCount, scatterPayout, totalPayout: lineTotal + scatterPayout, totalBet };
}

// ── exact multi-line RTP by full-grid enumeration ──────────────────────────────────────────────

/** Every combination of reel stops, one per reel, in reel order — `product(reel.length)` tuples
 *  total, each equally likely (matches `spinReelWindow`'s uniform-stop draw exactly, so walking
 *  every tuple here IS walking every equally-likely spin outcome, once each). An odometer-style
 *  counter (mirroring `odds.mjs#pipTuples`), not recursion, so this is safe at whatever tuple
 *  count a caller's reel lengths produce. */
function* reelStopCombinations(reels) {
  const n = reels.length;
  const lengths = reels.map((r) => r.length);
  const total = lengths.reduce((a, b) => a * b, 1);
  const stops = new Array(n).fill(0);
  for (let i = 0; i < total; i++) {
    yield stops;
    for (let pos = n - 1; pos >= 0; pos--) {
      stops[pos] += 1;
      if (stops[pos] < lengths[pos]) break;
      stops[pos] = 0;
    }
  }
}

/**
 * Exact return-to-player for a full 5-reel-shaped (or any reelCount x rows) grid machine with
 * paylines, wilds, and an optional scatter pay — by walking every equally-likely reel-stop
 * combination (see `reelStopCombinations`), exactly as `odds.mjs#computeSlotRTP` walks every
 * single-row reel combination, generalized to a windowed grid and many paylines.
 *
 * Also returns the exact scatter-count distribution (`Map<count, probability>`) and the exact
 * probability of at least `scatterTriggerCount` scatters landing anywhere on the grid in one
 * spin — this is REEL data (how often the strips themselves produce N scatters), not paytable
 * data, so it belongs here the same way `symbolHitOdds` belongs in `reels.mjs` rather than in a
 * game's own paytable module; a caller (a game's own `ev.mts`) combines this trigger probability
 * with its own free-spin-award/retrigger rules (game data this module has no opinion on) to get
 * a free-spin EV contribution analytically (a renewal/branching-process closed form over this
 * exact per-spin trigger probability), without this function needing to simulate a bonus round
 * itself.
 *
 * Returns `{ rtp, expectedPayout, combinations, totalBet, scatterTriggerProbability,
 * scatterCountDistribution }`. `rtp`/`expectedPayout` are exact (full enumeration); `scatter*`
 * fields are `null`/empty when `opts.scatter` is not supplied.
 */
export function computeMultiLineSlotRTP(reels, rows, paylinesSpec, paytable, opts = {}) {
  assertReels(reels);
  assertRows(rows);
  assertPaylines(paylinesSpec, reels.length, rows);
  if (!paytable || typeof paytable !== 'object') {
    throw new TypeError('computeMultiLineSlotRTP: paytable must be an object keyed by symbol name');
  }
  const betPerLine = opts.betPerLine ?? 1;
  if (!(betPerLine > 0)) throw new RangeError(`computeMultiLineSlotRTP: betPerLine must be positive (got ${betPerLine})`);
  const totalBet = betPerLine * paylinesSpec.length;
  const scatter = opts.scatter ?? null;
  const scatterTriggerCount = opts.scatterTriggerCount ?? 3;

  let combinations = 0;
  let payoutSum = 0;
  let triggerCombinations = 0;
  const scatterCountTotals = new Map();

  for (const stops of reelStopCombinations(reels)) {
    combinations += 1;
    const grid = reels.map((reel, i) => reelWindowAt(reel, stops[i], rows));
    const result = evaluateSpin(grid, paylinesSpec, paytable, { ...opts, betPerLine, totalBet, scatter });
    payoutSum += result.totalPayout;
    if (scatter !== null) {
      scatterCountTotals.set(result.scatterCount, (scatterCountTotals.get(result.scatterCount) ?? 0) + 1);
      if (result.scatterCount >= scatterTriggerCount) triggerCombinations += 1;
    }
  }

  const expectedPayout = payoutSum / combinations;
  const scatterCountDistribution = new Map();
  for (const [count, n] of scatterCountTotals) scatterCountDistribution.set(count, n / combinations);

  return {
    rtp: expectedPayout / totalBet,
    expectedPayout,
    combinations,
    totalBet,
    scatterTriggerProbability: scatter !== null ? triggerCombinations / combinations : null,
    scatterCountDistribution,
  };
}

/** Exact probability that a specific symbol lands at a specific row of one reel's window — the
 *  building block for a jackpot (or any other single-line, all-reels-must-match) rare-event
 *  odds figure: multiply this across every reel in the target payline pattern (independent
 *  draws, since `spinGrid` picks each reel's stop independently) to get the exact probability of
 *  that whole combination, per `computeJackpotOdds` below. */
export function symbolAtRowOdds(reel, row, rows, symbol) {
  assertReel(reel);
  assertRows(rows);
  let hits = 0;
  for (let stop = 0; stop < reel.length; stop++) {
    if (reelWindowAt(reel, stop, rows)[row] === symbol) hits += 1;
  }
  return hits / reel.length;
}

/** Exact probability of one specific symbol appearing at every reel's row named by `pattern`
 *  simultaneously — reels are spun independently (`spinGrid`), so this is the plain product of
 *  each reel's own `symbolAtRowOdds`. This is the kernel-level primitive a jackpot's "land the
 *  designated rare combination" odds figure is built from; the payout amount and which pattern
 *  counts as the jackpot are game data (a game's own rules module), not this function's
 *  concern. */
export function computeJackpotOdds(reels, rows, pattern, symbol) {
  assertReels(reels);
  assertRows(rows);
  if (!Array.isArray(pattern) || pattern.length !== reels.length) {
    throw new TypeError('computeJackpotOdds: pattern must have exactly one row index per reel');
  }
  let probability = 1;
  for (let i = 0; i < reels.length; i++) probability *= symbolAtRowOdds(reels[i], pattern[i], rows, symbol);
  return probability;
}
