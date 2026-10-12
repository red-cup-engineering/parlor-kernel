import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pigRollOutcome, foldPigTurn, pigBank,
  scoreFarkleHand, farkleBust,
  YACHT_CATEGORIES, scoreYachtCategory,
} from './tally.mjs';

// ── Pig ──────────────────────────────────────────────────────────────────────────────────────

test('pigRollOutcome: a 1 busts, anything else continues', () => {
  assert.equal(pigRollOutcome(1), 'bust');
  for (const pip of [2, 3, 4, 5, 6]) assert.equal(pigRollOutcome(pip), 'continue');
});

test('foldPigTurn: accumulates pips until the sequence ends', () => {
  assert.deepEqual(foldPigTurn([3, 4, 5]), { turnTotal: 12, busted: false });
});

test('foldPigTurn: a 1 anywhere in the sequence busts and zeroes the turn total', () => {
  assert.deepEqual(foldPigTurn([5, 4, 1, 6]), { turnTotal: 0, busted: true });
});

test('foldPigTurn: an empty roll sequence is an un-busted zero turn', () => {
  assert.deepEqual(foldPigTurn([]), { turnTotal: 0, busted: false });
});

test('foldPigTurn: does not mutate its input', () => {
  const pips = [2, 3, 4];
  const copy = [...pips];
  foldPigTurn(pips);
  assert.deepEqual(pips, copy);
});

test('pigBank: adds the turn total to the player score', () => {
  assert.equal(pigBank(20, 15), 35);
  assert.equal(pigBank(0, 0), 0);
});

test('pigBank: rejects negative inputs', () => {
  assert.throws(() => pigBank(-1, 5), RangeError);
  assert.throws(() => pigBank(5, -1), RangeError);
});

// ── Farkle ───────────────────────────────────────────────────────────────────────────────────

test('scoreFarkleHand: a single 1 scores 100, a single 5 scores 50, nothing else scores alone', () => {
  assert.equal(scoreFarkleHand([1, 2, 3, 4, 6]).score, 100);
  assert.equal(scoreFarkleHand([5, 2, 3, 4, 6]).score, 50);
  assert.equal(scoreFarkleHand([2, 3, 4, 6]).score, 0);
});

test('scoreFarkleHand: three 1s score 1000 (the exception), three of anything else scores face x 100', () => {
  assert.equal(scoreFarkleHand([1, 1, 1, 2, 6]).score, 1000);
  assert.equal(scoreFarkleHand([4, 4, 4, 2, 6]).score, 400);
  assert.equal(scoreFarkleHand([6, 6, 6]).score, 600);
});

test('scoreFarkleHand: extra dice beyond a triple double the triple score per extra die', () => {
  assert.equal(scoreFarkleHand([3, 3, 3, 3]).score, 600); // 300 * 2^1
  assert.equal(scoreFarkleHand([3, 3, 3, 3, 3]).score, 1200); // 300 * 2^2
  assert.equal(scoreFarkleHand([3, 3, 3, 3, 3, 3]).score, 2400); // 300 * 2^3
});

test('scoreFarkleHand: leftover 1s/5s not absorbed into a triple still score as singles', () => {
  // Three 2s (200) plus a leftover 1 (100) plus a leftover 5 (50) = 350.
  const result = scoreFarkleHand([2, 2, 2, 1, 5]);
  assert.equal(result.score, 350);
});

test('scoreFarkleHand: a hand with no scoring dice at all is a bust (score 0)', () => {
  assert.equal(scoreFarkleHand([2, 3, 4, 6]).score, 0);
  assert.equal(farkleBust([2, 3, 4, 6]), true);
});

test('scoreFarkleHand: breakdown lists each scoring group with face/count/points', () => {
  const result = scoreFarkleHand([1, 1, 5]);
  assert.deepEqual(
    result.breakdown.sort((a, b) => a.face - b.face),
    [{ face: 1, count: 2, points: 200 }, { face: 5, count: 1, points: 50 }],
  );
});

test('scoreFarkleHand: rejects an out-of-range dice count', () => {
  assert.throws(() => scoreFarkleHand([]), RangeError);
  assert.throws(() => scoreFarkleHand([1, 1, 1, 1, 1, 1, 1]), RangeError);
});

// ── Yacht ────────────────────────────────────────────────────────────────────────────────────

test('YACHT_CATEGORIES: exactly the 12 standard categories', () => {
  assert.equal(YACHT_CATEGORIES.length, 12);
  assert.ok(YACHT_CATEGORIES.includes('yacht'));
  assert.ok(YACHT_CATEGORIES.includes('little-straight'));
});

test('scoreYachtCategory: number categories sum only the matching face', () => {
  const dice = [2, 2, 2, 5, 6];
  assert.equal(scoreYachtCategory(dice, 'twos'), 6);
  assert.equal(scoreYachtCategory(dice, 'fives'), 5);
  assert.equal(scoreYachtCategory(dice, 'ones'), 0);
});

test('scoreYachtCategory: full-house scores the dice sum only for a true triple+pair', () => {
  assert.equal(scoreYachtCategory([3, 3, 3, 5, 5], 'full-house'), 19);
  assert.equal(scoreYachtCategory([3, 3, 4, 5, 5], 'full-house'), 0); // two pair, not a full house
  assert.equal(scoreYachtCategory([2, 2, 2, 2, 2], 'full-house'), 0); // five of a kind is not a full house
});

test('scoreYachtCategory: four-of-a-kind scores the dice sum when >= 4 dice share a face', () => {
  assert.equal(scoreYachtCategory([6, 6, 6, 6, 2], 'four-of-a-kind'), 26);
  assert.equal(scoreYachtCategory([6, 6, 6, 2, 3], 'four-of-a-kind'), 0);
});

test('scoreYachtCategory: straights score a fixed 30 only on an exact match', () => {
  assert.equal(scoreYachtCategory([1, 2, 3, 4, 5], 'little-straight'), 30);
  assert.equal(scoreYachtCategory([5, 4, 3, 2, 1], 'little-straight'), 30); // order-independent
  assert.equal(scoreYachtCategory([1, 2, 3, 4, 6], 'little-straight'), 0);
  assert.equal(scoreYachtCategory([2, 3, 4, 5, 6], 'big-straight'), 30);
  assert.equal(scoreYachtCategory([1, 2, 3, 4, 5], 'big-straight'), 0);
});

test('scoreYachtCategory: choice always sums all five dice', () => {
  assert.equal(scoreYachtCategory([1, 2, 3, 4, 5], 'choice'), 15);
  assert.equal(scoreYachtCategory([6, 6, 6, 6, 6], 'choice'), 30);
});

test('scoreYachtCategory: yacht scores a fixed 50 for five of a kind, else 0', () => {
  assert.equal(scoreYachtCategory([4, 4, 4, 4, 4], 'yacht'), 50);
  assert.equal(scoreYachtCategory([4, 4, 4, 4, 3], 'yacht'), 0);
});

test('scoreYachtCategory: rejects a hand that is not exactly 5 dice', () => {
  assert.throws(() => scoreYachtCategory([1, 2, 3, 4], 'choice'), RangeError);
});

test('scoreYachtCategory: rejects an unknown category', () => {
  assert.throws(() => scoreYachtCategory([1, 2, 3, 4, 5], 'sevens'), TypeError);
});
