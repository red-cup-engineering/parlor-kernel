import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDie, rollDice, diceTotal, faceCounts, rollLogEntry, diePmf, diceSumPmf } from './dice.mjs';
import { seededStream } from '@red-cup-engineering/computer-data-engineering-services-section/randomization/stream';

test('rollDie: always within [1, sides]', () => {
  const rng = seededStream('rolldie-probe');
  for (let i = 0; i < 1000; i++) {
    const pip = rollDie(rng, 6);
    assert.ok(Number.isInteger(pip) && pip >= 1 && pip <= 6);
  }
});

test('rollDie: same seed -> same die roll, forever', () => {
  const a = rollDie(seededStream('fixed-seed'), 6);
  const b = rollDie(seededStream('fixed-seed'), 6);
  assert.equal(a, b);
});

test('rollDie: rejects non-positive-integer sides', () => {
  const rng = seededStream('x');
  assert.throws(() => rollDie(rng, 0), RangeError);
  assert.throws(() => rollDie(rng, 3.5), RangeError);
});

test('rollDie: rejects a non-Rng first argument', () => {
  assert.throws(() => rollDie({}, 6), TypeError);
});

test('rollDice: returns `count` pips in roll order, same seed -> identical sequence', () => {
  const seqA = rollDice(seededStream('dice-seq'), 10, 6);
  const seqB = rollDice(seededStream('dice-seq'), 10, 6);
  assert.equal(seqA.length, 10);
  assert.deepEqual(seqA, seqB);
});

test('diceTotal: sums pip values', () => {
  assert.equal(diceTotal([1, 2, 3]), 6);
  assert.equal(diceTotal([6, 6, 6, 6, 6]), 30);
});

test('diceTotal: rejects an empty array', () => {
  assert.throws(() => diceTotal([]), TypeError);
});

test('faceCounts: tallies each face value, index k = count of pip value k', () => {
  const counts = faceCounts([1, 1, 5, 5, 5, 3], 6);
  assert.equal(counts[1], 2);
  assert.equal(counts[3], 1);
  assert.equal(counts[5], 3);
  assert.equal(counts[2], 0);
  assert.equal(counts.length, 7); // index 0 unused
});

test('faceCounts: rejects a pip value outside the die\'s range', () => {
  assert.throws(() => faceCounts([7], 6), RangeError);
});

test('rollLogEntry: builds a GameEvent-shaped entry and defensively copies the dice array', () => {
  const dice = [3, 4, 2];
  const entry = rollLogEntry(dice, 6);
  assert.deepEqual(entry, { kind: 'dice-roll', sides: 6, dice: [3, 4, 2], total: 9 });
  dice.push(1);
  assert.deepEqual(entry.dice, [3, 4, 2], 'logged entry must not alias the input array');
});

test('diePmf: a fair d6 has 6 outcomes, each probability 1/6, summing to 1', () => {
  const pmf = diePmf(6);
  assert.equal(pmf.length, 6);
  for (const entry of pmf) assert.equal(entry.probability, 1 / 6);
  const total = pmf.reduce((s, e) => s + e.probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test('diePmf: a d20 has 20 equally-likely pips', () => {
  const pmf = diePmf(20);
  assert.equal(pmf.length, 20);
  assert.equal(pmf[0].pip, 1);
  assert.equal(pmf[19].pip, 20);
  for (const entry of pmf) assert.equal(entry.probability, 1 / 20);
});

test('diceSumPmf: two fair d6 — probability mass matches the textbook 2d6 distribution exactly', () => {
  const pmf = diceSumPmf(2, 6);
  const byTotal = new Map(pmf.map((e) => [e.total, e]));
  // The canonical 2d6 ways-to-roll table.
  const expectedWays = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  for (const [total, ways] of Object.entries(expectedWays)) {
    const entry = byTotal.get(Number(total));
    assert.ok(entry, `missing total ${total}`);
    assert.equal(entry.ways, ways);
    assert.equal(entry.probability, ways / 36);
  }
  assert.equal(pmf.length, 11); // totals 2..12
});

test('diceSumPmf: probabilities always sum to exactly 1 (within float epsilon) for several configurations', () => {
  for (const [count, sides] of [[1, 6], [2, 6], [3, 6], [1, 20], [5, 6]]) {
    const pmf = diceSumPmf(count, sides);
    const total = pmf.reduce((s, e) => s + e.probability, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `count=${count} sides=${sides} summed to ${total}`);
  }
});

test('diceSumPmf: count = 1 reduces to diePmf, relabeled', () => {
  const sum = diceSumPmf(1, 6);
  const die = diePmf(6);
  assert.deepEqual(
    sum.map((e) => ({ pip: e.total, probability: e.probability })),
    die,
  );
});

test('diceSumPmf: ways sum to sides ** count', () => {
  const pmf = diceSumPmf(3, 6);
  const totalWays = pmf.reduce((s, e) => s + e.ways, 0);
  assert.equal(totalWays, 6 ** 3);
});
