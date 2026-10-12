/**
 * reels.mjs — slot reels as data (a reel is nothing but an ordered array of symbol strips,
 * one per physical/virtual reel), seeded spins over an injected `Rng` (`./seed.mjs`), and
 * per-symbol hit odds derived directly from a reel's own symbol multiset — never a hand-typed
 * number. This is the piece that makes the slot machine's PRACTICE-ONLY, published-odds
 * promise auditable: a reel's hit odds are a pure function of the reel's own data, so the
 * face can never show a number the data didn't produce.
 *
 * This module owns reel data and spins only. RTP (the reel-crossed-with-a-paytable figure) is
 * `./odds.mjs#computeSlotRTP`'s job, not this module's — a paytable is per-game data this
 * module deliberately knows nothing about, same separation `./board.mjs` keeps from a specific
 * board game's rules.
 */

function assertReel(reel, label = 'reel') {
  if (!Array.isArray(reel) || reel.length === 0) {
    throw new TypeError(`reels: ${label} must be a non-empty array of symbol strings`);
  }
  if (!reel.every((s) => typeof s === 'string' && s.length > 0)) {
    throw new TypeError(`reels: every symbol in ${label} must be a non-empty string`);
  }
}

function assertRng(rng) {
  if (typeof rng?.int !== 'function') {
    throw new TypeError('reels: rng must be an Rng (see ./seed.mjs#seededStream)');
  }
}

/** Validate and freeze a single reel strip (an ordered array of symbol strings — order
 *  matters only for `spinReel`'s uniform draw, not for scoring). Returns a defensive copy so
 *  a caller's later mutation of the input array can never change a reel already handed to a
 *  game's engine. */
export function createReel(symbols) {
  assertReel(symbols, 'symbols');
  return Object.freeze([...symbols]);
}

/** Build a machine's full reel set (one strip per physical reel) from plain arrays. */
export function createReels(strips) {
  if (!Array.isArray(strips) || strips.length === 0) {
    throw new TypeError('createReels: strips must be a non-empty array of reel symbol arrays');
  }
  return strips.map((s) => createReel(s));
}

/** One uniformly-random draw from a single reel strip: every position on the strip is equally
 *  likely, so a symbol repeated `k` times on a strip of length `n` lands with probability
 *  `k/n` — exactly `symbolHitOdds`' figure, by construction, not by coincidence. */
export function spinReel(rng, reel) {
  assertRng(rng);
  assertReel(reel);
  const index = rng.int(0, reel.length - 1);
  return reel[index];
}

/** Spin every reel in `reels`, left to right, from one `rng` stream — the deterministic order
 *  that makes a given seed reproduce the exact same spin result forever. Returns the array of
 *  landed symbols, one per reel, in reel order. */
export function spinReels(rng, reels) {
  assertRng(rng);
  if (!Array.isArray(reels) || reels.length === 0) {
    throw new TypeError('spinReels: reels must be a non-empty array of reel strips');
  }
  return reels.map((reel) => spinReel(rng, reel));
}

/** The exact per-symbol hit probability on one reel strip: a `Map<symbol, probability>` where
 *  each symbol's probability is its occurrence count on the strip divided by the strip's
 *  length. Sums to exactly 1 across every distinct symbol on the strip. */
export function symbolHitOdds(reel) {
  assertReel(reel);
  const counts = new Map();
  for (const symbol of reel) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  const odds = new Map();
  for (const [symbol, count] of counts) odds.set(symbol, count / reel.length);
  return odds;
}
