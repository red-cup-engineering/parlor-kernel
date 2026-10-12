import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReel, createReels, spinReel, spinReels, symbolHitOdds } from './reels.mjs';
import { seededStream } from '@red-cup-engineering/computer-data-engineering-services-section/randomization/stream';

test('createReel: validates and defensively copies a symbol strip', () => {
  const symbols = ['cherry', 'bell', 'bar'];
  const reel = createReel(symbols);
  assert.deepEqual(reel, ['cherry', 'bell', 'bar']);
  symbols.push('seven');
  assert.deepEqual(reel, ['cherry', 'bell', 'bar'], 'reel must not alias the input array');
});

test('createReel: rejects an empty strip or a non-string symbol', () => {
  assert.throws(() => createReel([]), TypeError);
  assert.throws(() => createReel(['cherry', 3]), TypeError);
});

test('createReels: builds one reel per strip', () => {
  const reels = createReels([['a', 'b'], ['c', 'd', 'e']]);
  assert.equal(reels.length, 2);
  assert.deepEqual(reels[0], ['a', 'b']);
  assert.deepEqual(reels[1], ['c', 'd', 'e']);
});

test('spinReel: always returns a symbol present on the strip', () => {
  const reel = createReel(['cherry', 'bell', 'bar']);
  const rng = seededStream('spin-probe');
  for (let i = 0; i < 500; i++) {
    assert.ok(reel.includes(spinReel(rng, reel)));
  }
});

test('spinReel: same seed -> same spin, forever', () => {
  const reel = createReel(['cherry', 'bell', 'bar', 'seven']);
  const a = spinReel(seededStream('slot-fixed-seed'), reel);
  const b = spinReel(seededStream('slot-fixed-seed'), reel);
  assert.equal(a, b);
});

test('spinReels: spins every reel left to right from one rng stream, deterministically', () => {
  const reels = createReels([['a', 'b'], ['c', 'd'], ['e', 'f']]);
  const resultA = spinReels(seededStream('multi-reel-seed'), reels);
  const resultB = spinReels(seededStream('multi-reel-seed'), reels);
  assert.equal(resultA.length, 3);
  assert.deepEqual(resultA, resultB);
});

test('property — the day\'s dice are the daily seed\'s dice: 200 independent spins of the same seed reproduce the identical sequence forever', () => {
  const reels = createReels([['cherry', 'bell', 'bar', 'seven', 'plum']]);
  const seq1 = [];
  const seq2 = [];
  const rngA = seededStream('daily-2026-08-19:slot');
  const rngB = seededStream('daily-2026-08-19:slot');
  for (let i = 0; i < 200; i++) {
    seq1.push(spinReels(rngA, reels)[0]);
    seq2.push(spinReels(rngB, reels)[0]);
  }
  assert.deepEqual(seq1, seq2);
});

test('symbolHitOdds: probability = occurrence count / strip length, exactly', () => {
  const reel = createReel(['cherry', 'cherry', 'bell', 'bar']);
  const odds = symbolHitOdds(reel);
  assert.equal(odds.get('cherry'), 0.5);
  assert.equal(odds.get('bell'), 0.25);
  assert.equal(odds.get('bar'), 0.25);
});

test('symbolHitOdds: sums to exactly 1 across every distinct symbol', () => {
  const reel = createReel(['a', 'a', 'a', 'b', 'c', 'c']);
  const odds = symbolHitOdds(reel);
  const total = [...odds.values()].reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test('symbolHitOdds: a single repeated symbol has hit probability 1', () => {
  const reel = createReel(['bar', 'bar', 'bar']);
  const odds = symbolHitOdds(reel);
  assert.equal(odds.get('bar'), 1);
  assert.equal(odds.size, 1);
});
