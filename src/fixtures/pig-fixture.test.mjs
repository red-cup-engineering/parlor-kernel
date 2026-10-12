import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pigCartridge } from './pig-fixture.mjs';
import { playVerifier, hashPosition } from '@red-cup-engineering/gaming/running/rules';
import { appendMove } from '@red-cup-engineering/gaming/running/play-record';
import { dailySeed } from '../seed.mjs';

const INTENTS = [
  { kind: 'roll' }, { kind: 'roll' }, { kind: 'bank' },
  { kind: 'roll' }, { kind: 'roll' }, { kind: 'roll' },
];

test('pigCartridge: initialPosition is a pure function of (seed, configId)', () => {
  const a = pigCartridge.initialPosition('seed-1', 'alice,bob');
  const b = pigCartridge.initialPosition('seed-1', 'alice,bob');
  assert.deepEqual(a, b);
});

test('pigCartridge: same seed + same intent sequence -> byte-identical replay, forever', () => {
  const r1 = pigCartridge.replay('fixed-pig-seed', INTENTS, 'alice,bob');
  const r2 = pigCartridge.replay('fixed-pig-seed', INTENTS, 'alice,bob');
  assert.deepEqual(r1.finalState, r2.finalState);
  assert.equal(r1.stateHash, r2.stateHash);
  assert.equal(r1.valid, true);
});

test('pigCartridge: two different seeds produce different play (dice differ)', () => {
  const r1 = pigCartridge.replay('seed-a', INTENTS, 'alice,bob');
  const r2 = pigCartridge.replay('seed-b', INTENTS, 'alice,bob');
  assert.notEqual(r1.stateHash, r2.stateHash);
});

test('pigCartridge: "the day\'s dice are the daily seed\'s dice" — a daily seed replayed with the same intents on the same day always agrees', () => {
  const date = '2026-08-19';
  const seed = dailySeed('pig-fixture', date);
  const r1 = pigCartridge.replay(seed, INTENTS, 'alice,bob');
  const r2 = pigCartridge.replay(seed, INTENTS, 'alice,bob');
  assert.equal(r1.stateHash, r2.stateHash);
});

test('pigCartridge: replay never mutates initialPosition\'s initial state across intents (structural sharing only where unchanged)', () => {
  const initial = pigCartridge.initialPosition('mutation-probe', 'alice,bob');
  const initialSnapshot = JSON.parse(JSON.stringify(initial));
  pigCartridge.replay('mutation-probe', INTENTS, 'alice,bob');
  assert.deepEqual(initial, initialSnapshot);
});

test('pigCartridge: rolling a 1 busts the turn and hands play to the next player — proven by forcing a seed known to roll a 1 first', () => {
  // Find a seed whose very first roll (rollCount 0) is a bust, by trying a handful of
  // candidate seeds against the same kernel primitives the fixture itself uses — this keeps
  // the test honest about *why* a given seed busts rather than asserting a magic string.
  let bustingSeed = null;
  for (let i = 0; i < 200; i++) {
    const candidate = `probe-${i}`;
    const state = pigCartridge.initialPosition(candidate, 'alice,bob');
    const result = pigCartridge.extend(state, { kind: 'roll' });
    if (result.events.some((e) => e.kind === 'bust')) {
      bustingSeed = candidate;
      break;
    }
  }
  assert.ok(bustingSeed !== null, 'expected at least one busting seed among 200 probes');
  const state = pigCartridge.initialPosition(bustingSeed, 'alice,bob');
  const result = pigCartridge.extend(state, { kind: 'roll' });
  assert.equal(result.state.turn.data.turnTotal, 0);
  assert.equal(result.state.turn.activePlayerIndex, 1); // turn passed to bob
});

test('pigCartridge: banking adds the turn total to the active player\'s score and passes the turn', () => {
  let state = pigCartridge.initialPosition('bank-probe', 'alice,bob');
  // Roll until we accumulate a non-zero turn total without busting (bounded attempts).
  for (let i = 0; i < 50 && state.turn.data.turnTotal === 0 && state.turn.activePlayerIndex === 0; i++) {
    const result = pigCartridge.extend(state, { kind: 'roll' });
    state = result.state;
  }
  assert.ok(state.turn.data.turnTotal > 0, 'expected to accumulate a positive turn total before this test\'s bound');
  const before = state.turn.data.turnTotal;
  const banked = pigCartridge.extend(state, { kind: 'bank' });
  assert.equal(banked.state.turn.data.scores['alice'], before);
  assert.equal(banked.state.turn.data.turnTotal, 0);
  assert.equal(banked.state.turn.activePlayerIndex, 1);
});

test('pigCartridge: rejects an unknown intent kind', () => {
  const state = pigCartridge.initialPosition('unknown-kind-probe', 'alice,bob');
  assert.throws(() => pigCartridge.extend(state, { kind: 'quit' }), TypeError);
});

test('replay glue: an intent log built via appendMove replays through playVerifier to the same stateHash as a direct replay', () => {
  let log = [];
  for (const intent of INTENTS) log = appendMove(log, intent);

  const verify = playVerifier(pigCartridge);
  const verified = verify('log-glue-seed', 'alice,bob', log);
  const direct = pigCartridge.replay('log-glue-seed', INTENTS, 'alice,bob');

  assert.equal(verified.valid, true);
  assert.equal(verified.stateHash, direct.stateHash);
  assert.equal(verified.stateHash, hashPosition(direct.finalState));
});

test('replay glue: serialize/deserialize round-trip the fixture\'s already-JSON state (identity default)', () => {
  const state = pigCartridge.initialPosition('serialize-probe', 'alice,bob');
  const serialized = pigCartridge.serialize(state);
  const deserialized = pigCartridge.deserialize(serialized);
  assert.deepEqual(deserialized, state);
});
