import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pigBustProbability, farkleBustProbability, yachtCategoryExpectations, computeSlotRTP } from './odds.mjs';
import { createReels } from './reels.mjs';
import { scoreFarkleHand } from './tally.mjs';

// ── Pig: the headline hand-computed case ────────────────────────────────────────────────────

test('pigBustProbability: a fair d6 busts a Pig turn with probability exactly 1/6', () => {
  assert.equal(pigBustProbability(6), 1 / 6);
});

test('pigBustProbability: generalizes correctly to any die size, by hand: 1/sides', () => {
  assert.equal(pigBustProbability(4), 1 / 4);
  assert.equal(pigBustProbability(20), 1 / 20);
});

// ── Farkle: exact bust probabilities, checked against independently hand-derived fractions ────
//
// diceCount = 1: only faces {1, 5} score (100, 50); the other four faces {2, 3, 4, 6} bust.
//   P(bust) = 4/6 = 2/3, by hand.
// diceCount = 2: bust requires *neither* die be a 1 or a 5 (two dice can never form a triple),
//   i.e. both dice drawn from {2, 3, 4, 6}: 4*4 = 16 of the 36 ordered outcomes.
//   P(bust) = 16/36 = 4/9, by hand.
// diceCount = 3: bust requires all three dice drawn from {2, 3, 4, 6} (4^3 = 64 outcomes) AND
//   not all three equal (a triple of 2s/3s/4s/6s *does* score, at face x 100) — 4 of those 64
//   are triples (222, 333, 444, 666), leaving 60 busting outcomes out of 216 total.
//   P(bust) = 60/216 = 5/18, by hand.

test('farkleBustProbability: diceCount = 1 matches the hand-computed fraction 2/3', () => {
  assert.equal(farkleBustProbability(1), 2 / 3);
});

test('farkleBustProbability: diceCount = 2 matches the hand-computed fraction 4/9', () => {
  assert.equal(farkleBustProbability(2), 4 / 9);
});

test('farkleBustProbability: diceCount = 3 matches the hand-computed fraction 5/18', () => {
  assert.equal(farkleBustProbability(3), 5 / 18);
});

test('farkleBustProbability: cross-checked by an independent brute-force enumeration in this test, not the module\'s own pipTuples helper', () => {
  for (const diceCount of [1, 2, 3, 4]) {
    let busts = 0;
    let total = 0;
    // Independent odometer, written fresh here rather than imported, so a bug shared between
    // this loop and odds.mjs's internal enumeration can't hide the same bug twice.
    const digits = new Array(diceCount).fill(1);
    const totalOutcomes = 6 ** diceCount;
    for (let i = 0; i < totalOutcomes; i++) {
      total += 1;
      if (scoreFarkleHand(digits).score === 0) busts += 1;
      for (let pos = diceCount - 1; pos >= 0; pos--) {
        if (digits[pos] < 6) { digits[pos] += 1; break; }
        digits[pos] = 1;
      }
    }
    assert.equal(total, totalOutcomes);
    assert.equal(busts / total, farkleBustProbability(diceCount), `diceCount=${diceCount}`);
  }
});

test('farkleBustProbability: memoizes but is pure — repeated calls with the same diceCount agree', () => {
  assert.equal(farkleBustProbability(6), farkleBustProbability(6));
});

test('farkleBustProbability: rejects an out-of-range diceCount', () => {
  assert.throws(() => farkleBustProbability(0), RangeError);
  assert.throws(() => farkleBustProbability(7), RangeError);
});

// ── Yacht: category expectations, exact enumeration over all 7,776 five-dice outcomes ─────────

test('yachtCategoryExpectations: "choice" (sum of all 5 dice) has expectation exactly 17.5 — 5 * E[1 fair die] = 5 * 3.5', () => {
  const expectations = yachtCategoryExpectations();
  assert.equal(expectations.get('choice'), 17.5);
});

test('yachtCategoryExpectations: "ones" has expectation exactly 5/6 — 5 dice, each contributing 1 with probability 1/6', () => {
  const expectations = yachtCategoryExpectations();
  const value = expectations.get('ones');
  assert.ok(Math.abs(value - 5 / 6) < 1e-9);
});

test('yachtCategoryExpectations: structural check — summing every number category\'s expectation equals "choice"\'s expectation exactly, since every outcome\'s total decomposes into its per-face contributions', () => {
  const expectations = yachtCategoryExpectations();
  const numberSum = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']
    .reduce((s, c) => s + expectations.get(c), 0);
  assert.ok(Math.abs(numberSum - expectations.get('choice')) < 1e-9);
});

test('yachtCategoryExpectations: "yacht" (five of a kind, 50 points) has the smallest expectation — it is the rarest category', () => {
  const expectations = yachtCategoryExpectations();
  const yacht = expectations.get('yacht');
  // Exactly 6 of the 7776 outcomes are a yacht (one per face), each worth 50: 6*50/7776.
  assert.ok(Math.abs(yacht - (6 * 50) / 7776) < 1e-12);
});

test('yachtCategoryExpectations: cached — calling twice returns the same Map contents', () => {
  const a = yachtCategoryExpectations();
  const b = yachtCategoryExpectations();
  assert.deepEqual([...a.entries()], [...b.entries()]);
});

// ── Slot RTP: a hand-built 3-symbol reel, computed vs. an independent exhaustive enumeration ──

const SYMBOLS = ['cherry', 'bell', 'bar'];
const TRIPLE_PAYOUT = { bar: 50, bell: 20, cherry: 10 };

function payoutFor(symbols) {
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    return TRIPLE_PAYOUT[symbols[0]];
  }
  const cherries = symbols.filter((s) => s === 'cherry').length;
  return cherries >= 2 ? 2 : 0;
}

test('computeSlotRTP: a hand-built 3-reel, 3-symbol-per-reel machine — RTP matches an independent, from-scratch exhaustive enumeration written in this test', () => {
  const reels = createReels([SYMBOLS, SYMBOLS, SYMBOLS]);

  // Independent brute force: three nested loops, not the module's reelCombinations generator.
  let payoutSum = 0;
  let combos = 0;
  for (const a of SYMBOLS) {
    for (const b of SYMBOLS) {
      for (const c of SYMBOLS) {
        combos += 1;
        payoutSum += payoutFor([a, b, c]);
      }
    }
  }
  // Hand-derivation: 3 triples (bar/bell/cherry) paying 50+20+10=80, plus 6 of the 24 remaining
  // combinations have exactly 2 cherries (3 position choices x 2 non-cherry third symbols),
  // each paying 2 -> 12. Total payout across all 27 combinations = 92.
  assert.equal(combos, 27);
  assert.equal(payoutSum, 92);

  const result = computeSlotRTP(reels, payoutFor, 1);
  assert.equal(result.combinations, 27);
  assert.equal(result.expectedPayout, payoutSum / combos);
  assert.equal(result.rtp, payoutSum / combos);
  assert.ok(Math.abs(result.rtp - 92 / 27) < 1e-12);
});

test('computeSlotRTP: rtp scales inversely with bet for a fixed paytable', () => {
  const reels = createReels([SYMBOLS, SYMBOLS, SYMBOLS]);
  const atOne = computeSlotRTP(reels, payoutFor, 1);
  const atTwo = computeSlotRTP(reels, payoutFor, 2);
  assert.equal(atOne.expectedPayout, atTwo.expectedPayout);
  assert.equal(atTwo.rtp, atOne.rtp / 2);
});

test('computeSlotRTP: combinations equals the product of reel lengths', () => {
  const reels = createReels([['a', 'b'], ['c', 'd', 'e'], ['f', 'g']]);
  const result = computeSlotRTP(reels, () => 0, 1);
  assert.equal(result.combinations, 2 * 3 * 2);
});

test('computeSlotRTP: rejects a payoutFor that returns a negative or non-finite payout', () => {
  const reels = createReels([SYMBOLS, SYMBOLS]);
  assert.throws(() => computeSlotRTP(reels, () => -1, 1), RangeError);
  assert.throws(() => computeSlotRTP(reels, () => Number.NaN, 1), RangeError);
});

test('computeSlotRTP: rejects an empty reel set or a non-positive bet', () => {
  assert.throws(() => computeSlotRTP([], () => 0, 1), TypeError);
  const reels = createReels([SYMBOLS]);
  assert.throws(() => computeSlotRTP(reels, () => 0, 0), RangeError);
});
