import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTurnState, activePlayer, withData, withPhase, endTurn, createTurnReducer } from './turns.mjs';

test('createTurnState: first player active, round 1, given phase and data', () => {
  const state = createTurnState(['alice', 'bob'], 'rolling', { score: 0 });
  assert.equal(state.activePlayerIndex, 0);
  assert.equal(state.round, 1);
  assert.equal(state.phase, 'rolling');
  assert.deepEqual(state.data, { score: 0 });
  assert.equal(activePlayer(state), 'alice');
});

test('createTurnState: rejects an empty players list', () => {
  assert.throws(() => createTurnState([]), TypeError);
});

test('createTurnState: defensively copies the players array', () => {
  const players = ['alice', 'bob'];
  const state = createTurnState(players);
  players.push('carol');
  assert.deepEqual(state.players, ['alice', 'bob']);
});

test('endTurn: advances to the next player without touching round mid-cycle', () => {
  const state = createTurnState(['alice', 'bob', 'carol']);
  const next = endTurn(state);
  assert.equal(activePlayer(next), 'bob');
  assert.equal(next.round, 1);
});

test('endTurn: wraps to the first player and increments round after the last seat', () => {
  let state = createTurnState(['alice', 'bob']);
  state = endTurn(state); // -> bob, round 1
  state = endTurn(state); // -> alice, round 2
  assert.equal(activePlayer(state), 'alice');
  assert.equal(state.round, 2);
});

test('endTurn: never mutates the state it was given', () => {
  const state = createTurnState(['alice', 'bob']);
  const before = JSON.stringify(state);
  endTurn(state);
  assert.equal(JSON.stringify(state), before);
});

test('endTurn: is pure — same input, same output, every time', () => {
  const state = createTurnState(['alice', 'bob', 'carol'], 'p', { x: 1 });
  const r1 = endTurn(state);
  const r2 = endTurn(state);
  assert.deepEqual(r1, r2);
  assert.notEqual(r1, state); // a new object, not the same reference
});

test('withData: replaces data wholesale, leaves everything else untouched', () => {
  const state = createTurnState(['alice'], 'p', { x: 1 });
  const next = withData(state, { x: 2, y: 3 });
  assert.deepEqual(next.data, { x: 2, y: 3 });
  assert.equal(next.phase, 'p');
  assert.deepEqual(state.data, { x: 1 }, 'original state untouched');
});

test('withPhase: replaces phase, leaves data untouched', () => {
  const state = createTurnState(['alice'], 'rolling', { x: 1 });
  const next = withPhase(state, 'banking');
  assert.equal(next.phase, 'banking');
  assert.deepEqual(next.data, { x: 1 });
  assert.equal(state.phase, 'rolling', 'original state untouched');
});

test('withPhase: rejects an empty phase string', () => {
  const state = createTurnState(['alice']);
  assert.throws(() => withPhase(state, ''), TypeError);
});

// ── createTurnReducer: a small fixture game (accumulate-or-bust over a fixed pip sequence) ───

function fixtureReducer() {
  return createTurnReducer({
    add: (state, intent) => {
      const turnTotal = state.data.turnTotal + intent.pip;
      return { state: withData(state, { ...state.data, turnTotal }), events: [{ kind: 'added', pip: intent.pip }] };
    },
    bank: (state) => {
      const player = activePlayer(state);
      const scores = { ...state.data.scores, [player]: (state.data.scores[player] ?? 0) + state.data.turnTotal };
      const banked = withData(state, { scores, turnTotal: 0 });
      return { state: endTurn(banked), events: [{ kind: 'banked', player, amount: state.data.turnTotal }] };
    },
  });
}

test('createTurnReducer: dispatches to the matching handler by intent kind', () => {
  const reducer = fixtureReducer();
  let state = createTurnState(['alice', 'bob'], 'active', { scores: {}, turnTotal: 0 });
  const r1 = reducer(state, { kind: 'add', pip: 4 });
  assert.equal(r1.state.data.turnTotal, 4);
  assert.deepEqual(r1.events, [{ kind: 'added', pip: 4 }]);

  const r2 = reducer(r1.state, { kind: 'bank' });
  assert.equal(r2.state.data.scores['alice'], 4);
  assert.equal(r2.state.data.turnTotal, 0);
  assert.equal(activePlayer(r2.state), 'bob');
});

test('createTurnReducer: throws on an intent kind with no registered handler', () => {
  const reducer = fixtureReducer();
  const state = createTurnState(['alice'], 'active', { scores: {}, turnTotal: 0 });
  assert.throws(() => reducer(state, { kind: 'unknown' }), TypeError);
});

test('createTurnReducer: throws on an intent with no string kind', () => {
  const reducer = fixtureReducer();
  const state = createTurnState(['alice'], 'active', { scores: {}, turnTotal: 0 });
  assert.throws(() => reducer(state, {}), TypeError);
});

test('purity — a full turn/round loop through the reducer is a pure fold: replaying the same intent sequence from the same start twice gives identical, distinct-object results', () => {
  const reducer = fixtureReducer();
  const start = createTurnState(['alice', 'bob'], 'active', { scores: {}, turnTotal: 0 });
  const intents = [
    { kind: 'add', pip: 3 }, { kind: 'add', pip: 5 }, { kind: 'bank' },
    { kind: 'add', pip: 2 }, { kind: 'bank' },
  ];

  const runOnce = () => {
    let state = start;
    for (const intent of intents) state = reducer(state, intent).state;
    return state;
  };

  const r1 = runOnce();
  const r2 = runOnce();
  assert.deepEqual(r1, r2);
  assert.notEqual(r1, r2);
  assert.deepEqual(r1.data.scores, { alice: 8, bob: 2 });
  assert.equal(r1.round, 2);
});
