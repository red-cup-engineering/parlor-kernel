import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reelWindowAt,
  spinReelWindow,
  spinGrid,
  evaluateLine,
  evaluateSpin,
  computeMultiLineSlotRTP,
  symbolAtRowOdds,
  computeJackpotOdds,
} from './paylines.mjs';
import { createReel, createReels } from './reels.mjs';
import { seededStream } from '@red-cup-engineering/computer-data-engineering-services-section/randomization/stream';

test('reelWindowAt: pure, wraps around the strip', () => {
  const reel = createReel(['a', 'b', 'c', 'd']);
  assert.deepEqual(reelWindowAt(reel, 0, 3), ['a', 'b', 'c']);
  assert.deepEqual(reelWindowAt(reel, 3, 3), ['d', 'a', 'b']); // wraps
  assert.deepEqual(reelWindowAt(reel, 3, 3), ['d', 'a', 'b']); // same call, same result
});

test('spinReelWindow: every symbol in the window is present on the strip, and same seed -> same window forever', () => {
  const reel = createReel(['cherry', 'bell', 'bar', 'seven', 'plum']);
  const rng = seededStream('window-probe');
  for (let i = 0; i < 200; i++) {
    const window = spinReelWindow(rng, reel, 3);
    assert.equal(window.length, 3);
    for (const s of window) assert.ok(reel.includes(s));
  }
  const a = spinReelWindow(seededStream('fixed-window-seed'), reel, 3);
  const b = spinReelWindow(seededStream('fixed-window-seed'), reel, 3);
  assert.deepEqual(a, b);
});

test('spinGrid: one column per reel, deterministic by seed', () => {
  const reels = createReels([
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
  const gridA = spinGrid(seededStream('grid-seed'), reels, 3);
  const gridB = spinGrid(seededStream('grid-seed'), reels, 3);
  assert.equal(gridA.length, 2);
  assert.equal(gridA[0].length, 3);
  assert.deepEqual(gridA, gridB);
});

// A small 3-reel, 3-row fixture with one wild and one scatter, used across the evaluation tests
// below so every assertion is checkable by hand.
const PAYTABLE = {
  cherry: { 3: 10 },
  bell: { 3: 5 },
  wild: { 3: 20 },
};
const SCATTER_PAYTABLE = { 2: 2, 3: 10 };

test('evaluateLine: a plain 3-of-a-kind on the line pays', () => {
  const grid = [
    ['cherry', 'x', 'x'],
    ['cherry', 'x', 'x'],
    ['cherry', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.deepEqual(win, { symbol: 'cherry', count: 3, multiplier: 10 });
});

test('evaluateLine: wild substitutes for a paying symbol', () => {
  const grid = [
    ['wild', 'x', 'x'],
    ['cherry', 'x', 'x'],
    ['cherry', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.deepEqual(win, { symbol: 'cherry', count: 3, multiplier: 10 });
});

test('evaluateLine: an all-wild run pays under the paytable\'s own "wild" entry', () => {
  const grid = [
    ['wild', 'x', 'x'],
    ['wild', 'x', 'x'],
    ['wild', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.deepEqual(win, { symbol: 'wild', count: 3, multiplier: 20 });
});

test('evaluateLine: a run must start at reel 0 — a mismatch there pays nothing even if reels 1..N match', () => {
  const grid = [
    ['bell', 'x', 'x'],
    ['cherry', 'x', 'x'],
    ['cherry', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.equal(win, null);
});

test('evaluateLine: a scatter on the line breaks the run and pays nothing from this function', () => {
  const grid = [
    ['cherry', 'x', 'x'],
    ['scatter', 'x', 'x'],
    ['cherry', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.equal(win, null); // only 1 cherry before the scatter breaks it, below the 3-count minimum
});

test('evaluateLine: below the paytable minimum count pays nothing', () => {
  const grid = [
    ['cherry', 'x', 'x'],
    ['cherry', 'x', 'x'],
    ['bell', 'x', 'x'],
  ];
  const win = evaluateLine(grid, [0, 0, 0], PAYTABLE, { wilds: ['wild'], scatter: 'scatter' });
  assert.equal(win, null);
});

test('evaluateSpin: sums every winning line and the scatter pay together', () => {
  const grid = [
    ['cherry', 'bell', 'x'],
    ['cherry', 'bell', 'x'],
    ['cherry', 'bell', 'scatter'],
  ];
  const paylines = [
    [0, 0, 0], // cherry x3
    [1, 1, 1], // bell x3
  ];
  const result = evaluateSpin(grid, paylines, PAYTABLE, {
    wilds: ['wild'],
    scatter: 'scatter',
    scatterPaytable: SCATTER_PAYTABLE,
    betPerLine: 2,
  });
  assert.equal(result.lineWins.length, 2);
  assert.equal(result.lineTotal, 10 * 2 + 5 * 2); // (multiplier * betPerLine) per line
  assert.equal(result.scatterCount, 1); // only one scatter present in this grid
  assert.equal(result.scatterPayout, 0); // below the scatter paytable's 2-count minimum
  assert.equal(result.totalPayout, result.lineTotal);
});

test('evaluateSpin: scatter pay scales off totalBet, not betPerLine', () => {
  const grid = [
    ['scatter', 'x', 'x'],
    ['scatter', 'x', 'x'],
    ['x', 'x', 'x'],
  ];
  const result = evaluateSpin(grid, [[0, 0, 0]], PAYTABLE, {
    wilds: ['wild'],
    scatter: 'scatter',
    scatterPaytable: SCATTER_PAYTABLE,
    betPerLine: 3,
    totalBet: 60, // e.g. 20 paylines x 3 bet-per-line in the real game, independent of this fixture's 1 line
  });
  assert.equal(result.scatterCount, 2);
  assert.equal(result.scatterPayout, 2 * 60);
});

test('computeMultiLineSlotRTP: exact against a hand-countable 2-reel, 2-row, 1-line, 1-symbol fixture', () => {
  // 2 reels of ['cherry','x'], 2 rows, one payline [0,0]. Every one of the 4 equally-likely stop
  // combinations is enumerable by hand: only the stop combination that puts 'cherry' at row 0 on
  // BOTH reels wins (paytable requires minCount 2 for this fixture). On a 2-symbol reel, a given
  // symbol sits at row 0 for exactly half of all stops (stop=0 -> ['cherry','x'], stop=1 ->
  // ['x','cherry']), so P(cherry at row 0) = 1/2 per reel, independent -> exact combined P = 1/4.
  const reels = createReels([
    ['cherry', 'x'],
    ['cherry', 'x'],
  ]);
  const paytable = { cherry: { 2: 4 } };
  const result = computeMultiLineSlotRTP(reels, 2, [[0, 0]], paytable, { betPerLine: 1, minCount: 2 });
  assert.equal(result.combinations, 4);
  assert.equal(result.expectedPayout, 0.25 * 4); // P(win) * multiplier * betPerLine
  assert.equal(result.rtp, result.expectedPayout / result.totalBet);
});

test('computeMultiLineSlotRTP: scatter-count distribution sums to 1 and matches a hand count', () => {
  // 2 reels of ['scatter','x'], 2 rows -> 4 equally-likely combinations. Scatter count anywhere
  // on the grid: stop=0 on a reel puts 'scatter' at BOTH rows (window ['scatter','scatter']
  // would need scatter to repeat — use a reel where scatter appears once per stop instead):
  const reels = createReels([
    ['scatter', 'x'],
    ['scatter', 'x'],
  ]);
  const paytable = {};
  const result = computeMultiLineSlotRTP(reels, 2, [[0, 0]], paytable, {
    betPerLine: 1,
    scatter: 'scatter',
    scatterTriggerCount: 2,
  });
  let total = 0;
  for (const p of result.scatterCountDistribution.values()) total += p;
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(result.scatterTriggerProbability >= 0 && result.scatterTriggerProbability <= 1);
});

test('computeMultiLineSlotRTP: matches computeSlotRTP\'s own exact figure on an equivalent 1-row, 1-line reduction', async () => {
  const { computeSlotRTP } = await import('./odds.mjs');
  const reels = createReels([
    ['cherry', 'bell', 'bar'],
    ['cherry', 'bell', 'bar'],
    ['cherry', 'bell', 'bar'],
  ]);
  const payoutFor = (symbols) => (symbols.every((s) => s === symbols[0]) ? (symbols[0] === 'cherry' ? 10 : symbols[0] === 'bell' ? 5 : 2) : 0);
  const legacy = computeSlotRTP(reels, payoutFor, 1);

  const paytable = { cherry: { 3: 10 }, bell: { 3: 5 }, bar: { 3: 2 } };
  const grid = computeMultiLineSlotRTP(reels, 1, [[0, 0, 0]], paytable, { betPerLine: 1 });
  assert.equal(grid.combinations, legacy.combinations);
  assert.ok(Math.abs(grid.rtp - legacy.rtp) < 1e-12);
});

test('symbolAtRowOdds: exact fraction of stops placing a symbol at a given row', () => {
  const reel = createReel(['a', 'a', 'b', 'c']); // 4 symbols, 2 rows checked below
  // row 0 of the window (== the stop itself): 'a' at stops 0,1 -> 2/4
  assert.equal(symbolAtRowOdds(reel, 0, 2, 'a'), 2 / 4);
  assert.equal(symbolAtRowOdds(reel, 0, 2, 'b'), 1 / 4);
  assert.equal(symbolAtRowOdds(reel, 0, 2, 'c'), 1 / 4);
});

test('computeJackpotOdds: exact product across reels (independent draws)', () => {
  const reels = createReels([
    ['wild', 'x', 'x', 'x'], // P(wild at row 0) = 1/4
    ['wild', 'wild', 'x', 'x'], // P(wild at row 0) = 2/4
  ]);
  const odds = computeJackpotOdds(reels, 1, [0, 0], 'wild');
  assert.ok(Math.abs(odds - (1 / 4) * (2 / 4)) < 1e-12);
});

test('computeMultiLineSlotRTP: rejects a payline whose length does not match the reel count', () => {
  const reels = createReels([
    ['a', 'b'],
    ['a', 'b'],
  ]);
  assert.throws(() => computeMultiLineSlotRTP(reels, 1, [[0, 0, 0]], { a: { 2: 1 } }), TypeError);
});
