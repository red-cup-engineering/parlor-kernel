/**
 * odds.mjs — the parlor kernel's odds/RTP calculator. Every figure here is *computed* from a
 * game's own data (a dice configuration, a scoring rule, a reel + paytable) by exhaustive
 * enumeration, never asserted as a hand-typed constant — this is the module that makes the
 * slot machine's "published RTP and per-symbol odds shown on the machine face" claim
 * auditable rather than a trust-me string, per `tileslots-market-teardown.md` §4's "exact,
 * published probabilities" precedent and the house directive that "the honesty friction is
 * the product, not a tax on it."
 *
 * ## On `gambling-services-section`
 *
 * `gambling-services-section` (`@lenticule-science/gambling-analysis-service`,
 * *not* an `@561-group/*` package and not published to the house Verdaccio) has real,
 * tested `kelly.mjs`/`odds.mjs` — but they are Lenticule Science's advantage-play toolkit for
 * binary prediction-market contracts (Kelly staking fractions, vig/overround removal on
 * (0,1)-priced books), not casino-game math. Nothing there computes a bust probability, a
 * category expectation, or a reel RTP, and the house dependency doctrine ("deps only pinned
 * `@561-group/*` from Verdaccio") gives no legal import path to a non-`@561-group/*`,
 * unpublished sibling section regardless. The doctrine-appropriate mechanism this module
 * consumes that prior art by is **citation, not import**: this file's header names it as the
 * closest existing staking-math precedent, and stops there. Every function below is original
 * to this package.
 *
 * All enumerations here are exact (every equally-likely outcome walked and counted), not
 * sampled — `odds.test.mts` checks several of these figures against independent hand
 * computation (Pig bust = 1/6 exactly) and against a from-scratch exhaustive enumeration of a
 * hand-built 3-symbol slot reel, so a bug in one enumeration strategy can't hide behind a bug
 * in the other.
 */
import { diePmf } from './dice.mjs';
import { scoreFarkleHand, scoreYachtCategory, YACHT_CATEGORIES } from './tally.mjs';

/** Every ordered tuple of `length` pip values drawn from `[1, sides]`, exactly once each,
 *  `sides ** length` tuples total — the shared exact-enumeration primitive every function
 *  below walks. An odometer-style counter, not recursion, so `length` up to the sizes this
 *  module actually uses (5, 6) never risks a call-stack limit. */
function* pipTuples(sides, length) {
  const digits = new Array(length).fill(1);
  const total = sides ** length;
  for (let i = 0; i < total; i++) {
    yield digits.slice();
    for (let pos = length - 1; pos >= 0; pos--) {
      if (digits[pos] < sides) {
        digits[pos] += 1;
        break;
      }
      digits[pos] = 1;
    }
  }
}

/** Every combination of one symbol per reel, in reel order — the product-measure enumeration
 *  `computeSlotRTP` needs. Recursive (reel counts are small — 3 to 5 physical reels in every
 *  realistic slot machine — so stack depth is never a concern the way `pipTuples`' dice counts
 *  could be at larger `length`). */
function* reelCombinations(reels, prefix = []) {
  if (prefix.length === reels.length) {
    yield prefix;
    return;
  }
  const reel = reels[prefix.length];
  for (const symbol of reel) {
    yield* reelCombinations(reels, [...prefix, symbol]);
  }
}

// ── Pig ──────────────────────────────────────────────────────────────────────────────────────

/** Exact Pig bust probability for a `sides`-sided die: the probability of rolling the one pip
 *  value (`1`) that busts a turn, read directly off `dice.mjs`'s exact single-die PMF rather
 *  than hard-coded — for the standard `sides = 6` die this is exactly `1/6`, matched by
 *  `odds.test.mts` against the hand-computed fraction. */
export function pigBustProbability(sides = 6) {
  const entry = diePmf(sides).find((e) => e.pip === 1);
  return entry.probability;
}

// ── Farkle ───────────────────────────────────────────────────────────────────────────────────

const farkleBustCache = new Map();

/** Exact Farkle bust probability for a hand of `diceCount` dice (standard six-dice Farkle,
 *  `diceCount` in `[1, 6]`): every one of the `6 ** diceCount` equally-likely ordered outcomes
 *  is scored via `tally.mjs#scoreFarkleHand` and the bust fraction counted exactly — not
 *  simulated. Memoized per `diceCount` since the full enumeration (up to 46,656 hands at
 *  `diceCount = 6`) is the same work every time it's asked for the same count. */
export function farkleBustProbability(diceCount = 6) {
  if (!Number.isInteger(diceCount) || diceCount < 1 || diceCount > 6) {
    throw new RangeError(`farkleBustProbability: diceCount must be in [1, 6] (got ${diceCount})`);
  }
  if (farkleBustCache.has(diceCount)) return farkleBustCache.get(diceCount);

  let busts = 0;
  let total = 0;
  for (const dice of pipTuples(6, diceCount)) {
    total += 1;
    if (scoreFarkleHand(dice).score === 0) busts += 1;
  }
  const probability = busts / total;
  farkleBustCache.set(diceCount, probability);
  return probability;
}

// ── Yacht ────────────────────────────────────────────────────────────────────────────────────

let yachtExpectationCache = null;

/** Exact expected score of every Yacht category over a single random five-dice roll (before
 *  any reroll — the base one-roll expectation), by exhaustively scoring all `6 ** 5 = 7,776`
 *  equally-likely five-dice outcomes against every category in `tally.mjs#YACHT_CATEGORIES`
 *  and averaging. Returns a `Map<category, expectedScore>`. Computed once and cached — the
 *  figures never change, since they depend on nothing but the fixed rules and a fair die. */
export function yachtCategoryExpectations() {
  if (yachtExpectationCache !== null) return yachtExpectationCache;

  const totals = new Map(YACHT_CATEGORIES.map((c) => [c, 0]));
  let outcomes = 0;
  for (const dice of pipTuples(6, 5)) {
    outcomes += 1;
    for (const category of YACHT_CATEGORIES) {
      totals.set(category, totals.get(category) + scoreYachtCategory(dice, category));
    }
  }
  const expectations = new Map(YACHT_CATEGORIES.map((c) => [c, totals.get(c) / outcomes]));
  yachtExpectationCache = expectations;
  return expectations;
}

// ── Slot RTP ─────────────────────────────────────────────────────────────────────────────────

/**
 * Exact return-to-player for a reel set + paytable, computed by walking every equally-likely
 * combination of symbols the reels can land on (the product of each reel's length — a
 * 3-reel, 8-symbol-per-reel machine is 512 combinations, small enough to enumerate exactly
 * rather than estimate). `payoutFor(symbols)` is the game's own paytable, expressed as a pure
 * function from a landed combination (`string[]`, one per reel, in reel order) to a payout
 * amount in the same units as `bet` — this module never assumes a specific paytable shape
 * (matching-symbols, paylines, scatter pays, whatever the game's own data calls for), only
 * that the function is total and pure over every reachable combination.
 *
 * Returns `{ rtp, expectedPayout, combinations }`: `expectedPayout` is the probability-weighted
 * average payout per spin, `rtp` is that divided by `bet` (the conventional "cents back per
 * cent wagered" figure a machine's disclosure face publishes), and `combinations` is the exact
 * count of distinct reel outcomes enumerated (an audit figure — a caller can cross-check it
 * against the product of reel lengths itself).
 */
export function computeSlotRTP(reels, payoutFor, bet = 1) {
  if (!Array.isArray(reels) || reels.length === 0) {
    throw new TypeError('computeSlotRTP: reels must be a non-empty array of reel strips');
  }
  if (typeof payoutFor !== 'function') {
    throw new TypeError('computeSlotRTP: payoutFor must be a function (symbols[]) => payout');
  }
  if (!(bet > 0)) {
    throw new RangeError(`computeSlotRTP: bet must be a positive number (got ${bet})`);
  }

  let combinations = 0;
  let payoutSum = 0;
  for (const symbols of reelCombinations(reels)) {
    combinations += 1;
    const payout = payoutFor(symbols);
    if (!Number.isFinite(payout) || payout < 0) {
      throw new RangeError(`computeSlotRTP: payoutFor(${JSON.stringify(symbols)}) returned an invalid payout ${payout}`);
    }
    payoutSum += payout;
  }

  const expectedPayout = payoutSum / combinations;
  return { rtp: expectedPayout / bet, expectedPayout, combinations };
}
