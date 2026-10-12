/**
 * turns.mjs — the generic turn/round loop, factored as a pure reducer over intents.
 *
 * A `TurnState` is deliberately game-agnostic: player order, whose turn it is, and a round
 * counter, plus one opaque `data` bag every game shapes for itself (a Pig turn total, a
 * board-race piece position, a slot machine's practice bankroll — this module never looks
 * inside `data`). `createTurnReducer` turns a game's own `{ [intentKind]: handler }` map into
 * a single `(state, intent) => { state, events }` function matching
 * `@red-cup-engineering/gaming/running/rules`'s `Cartridge.extend` shape exactly, so a parlor game's
 * `cartridge.mjs` can hand this straight to `./replay.mjs#gameRules` (or to
 * `@red-cup-engineering/gaming/running/rules`'s `replayPlay` directly) without writing its own dispatch
 * loop — the same "thin wrap, not reimplementation" discipline `onestone-service/src/
 * cartridge.mts` and `gambling-trainer-service/src/manifest.mts` already use.
 *
 * Purity is the whole point: every exported function here returns a *new* `TurnState` and
 * never mutates the one it was given, so replay (create engine once, fold every logged
 * intent through the reducer in order) reproduces the exact same state every time — this is
 * what `turns.test.mts`'s purity test asserts directly (call the same reducer with the same
 * `(state, intent)` twice, get deep-equal, distinct-reference results both times).
 */

function assertPlayers(players) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new TypeError('turns: players must be a non-empty array of player ids');
  }
}

/** A fresh `TurnState`: `players` in seating order, the first player active, round `1`, an
 *  initial `phase` label (opaque to this module — a game's own vocabulary, e.g. `'rolling'`),
 *  and an opaque `data` bag (defaults to `{}`). */
export function createTurnState(players, phase = 'active', data = {}) {
  assertPlayers(players);
  if (typeof phase !== 'string' || phase.length === 0) {
    throw new TypeError('turns: phase must be a non-empty string');
  }
  return { players: [...players], activePlayerIndex: 0, round: 1, phase, data };
}

/** The player id whose turn it currently is. */
export function activePlayer(state) {
  return state.players[state.activePlayerIndex];
}

/** A new state with `data` replaced wholesale (a game computes its own next `data` value and
 *  hands it here — this module never merges or inspects it). Every other field is carried
 *  over unchanged. */
export function withData(state, data) {
  return { ...state, data };
}

/** A new state with `phase` replaced. Carries `data` over unchanged — phase and data are
 *  independent axes a game may update together or separately. */
export function withPhase(state, phase) {
  if (typeof phase !== 'string' || phase.length === 0) {
    throw new TypeError('turns: phase must be a non-empty string');
  }
  return { ...state, phase };
}

/** Advance to the next player in seating order, wrapping around to the first player and
 *  incrementing `round` when the wrap happens — the whole "turn/round loop" in one pure step.
 *  `data` and `phase` are carried over unchanged; a game that wants to reset per-turn `data`
 *  (e.g. zero a Pig turn-total on the next player's turn) composes this with `withData`
 *  itself, in whichever order its own rules call for. */
export function endTurn(state) {
  const atLastSeat = state.activePlayerIndex === state.players.length - 1;
  return {
    ...state,
    activePlayerIndex: atLastSeat ? 0 : state.activePlayerIndex + 1,
    round: atLastSeat ? state.round + 1 : state.round,
  };
}

/**
 * Build a pure `(state, intent) => { state, events }` reducer from a game's own
 * `{ [intentKind]: (state, intent) => { state, events } }` handler map. Dispatch is exhaustive
 * by construction: an intent whose `kind` has no matching handler throws immediately, rather
 * than silently no-opping — the same "new kind, no handler, fails loudly" guarantee
 * `disclosure.mts`'s `classify` gives for spend-typing, applied here to turn dispatch. Every
 * handler receives the *current* `TurnState` (including whatever `data`/`phase` the previous
 * step left) and must return a `{ state, events }` pair without mutating its input — the
 * returned reducer only ever calls handlers and returns their result, so purity here is
 * exactly "the handler map's own handlers are pure," which `turns.test.mts` verifies for the
 * built-in `endTurn`/`withData`/`withPhase` combinators and any fixture handler map it builds
 * from them.
 */
export function createTurnReducer(handlers) {
  if (typeof handlers !== 'object' || handlers === null) {
    throw new TypeError('createTurnReducer: handlers must be an object of intent-kind -> handler');
  }
  return function turnReducer(state, intent) {
    if (typeof intent?.kind !== 'string') {
      throw new TypeError('turnReducer: intent must be an object with a string "kind"');
    }
    const handler = handlers[intent.kind];
    if (typeof handler !== 'function') {
      throw new TypeError(`turnReducer: no handler registered for intent kind "${intent.kind}"`);
    }
    return handler(state, intent);
  };
}
