/**
 * fixtures/pig-fixture.mjs — a small, real Pig implementation built entirely out of the
 * parlor kernel's own modules (`../seed.mjs`, `../dice.mjs`, `../turns.mjs`, `../tally.mjs`,
 * `../replay.mjs`), used by this package's own tests to prove the whole kernel-to-cartridge
 * path round-trips end to end — the same role `@red-cup-engineering/gaming/running/fixtures/toy-engine`
 * plays for cartridge itself, and available to any parlor game's own tests as a known-good
 * worked example of "how do I turn kernel pieces into a `Cartridge`."
 *
 * The one pattern worth calling out: `State` must be plain, replayable JSON, but rolling a
 * die needs an `Rng`, which is a stateful stream object — not JSON-safe and not something a
 * pure `extend` can carry forward call to call. The fix is the same one every
 * kernel-consuming game will reach for: `State` carries a monotonic `rollCount` instead of a
 * live `Rng`, and each `roll` intent derives a *fresh* sub-seed
 * (`${seed}:roll:${rollCount}`) from it via `seededStream` — deterministic (same seed, same
 * rollCount, same die), and fully pure (no stream survives between calls to leak state
 * `extend` didn't return).
 */
import { seededStream } from '@red-cup-engineering/computer-data-engineering-services-section/randomization/stream';
import { rollDie, rollLogEntry } from '../dice.mjs';
import { createTurnState, activePlayer, withData, endTurn } from '../turns.mjs';
import { pigRollOutcome, pigBank } from '../tally.mjs';
import { gameRules } from '@red-cup-engineering/gaming/running/rules';

export const GAME_ID = 'pig-fixture';

/** Pure function of (seed, configId): configId is a comma-separated player list, defaulting
 *  to two players. Identical arguments always produce byte-identical state. */
export function initialPosition(seed, configId) {
  const players = configId !== undefined && configId.length > 0 ? configId.split(',') : ['p1', 'p2'];
  const scores = Object.fromEntries(players.map((p) => [p, 0]));
  return {
    seed,
    turn: createTurnState(players, 'rolling', { scores, turnTotal: 0, rollCount: 0 }),
  };
}

/** `{ kind: 'roll' }` — rolls one die from a seed-derived, per-roll sub-stream; a 1 busts the
 *  turn (turn total lost, turn ends), anything else adds to the running turn total.
 *  `{ kind: 'bank' }` — banks the current turn total into the active player's score and ends
 *  the turn. Both are pure: given the same `state` and `intent`, always the same result. */
export function extend(state, intent) {
  switch (intent.kind) {
    case 'roll': {
      const rollCount = state.turn.data.rollCount;
      const rng = seededStream(`${state.seed}:roll:${rollCount}`);
      const pip = rollDie(rng, 6);
      const rollEvent = rollLogEntry([pip], 6);
      const outcome = pigRollOutcome(pip);
      if (outcome === 'bust') {
        const turn = withData(state.turn, { ...state.turn.data, turnTotal: 0, rollCount: rollCount + 1 });
        return { state: { ...state, turn: endTurn(turn) }, events: [rollEvent, { kind: 'bust' }] };
      }
      const turn = withData(state.turn, {
        ...state.turn.data,
        turnTotal: state.turn.data.turnTotal + pip,
        rollCount: rollCount + 1,
      });
      return { state: { ...state, turn }, events: [rollEvent] };
    }
    case 'bank': {
      const player = activePlayer(state.turn);
      const amount = state.turn.data.turnTotal;
      const scores = { ...state.turn.data.scores, [player]: pigBank(state.turn.data.scores[player], amount) };
      const turn = withData(state.turn, { ...state.turn.data, scores, turnTotal: 0 });
      return { state: { ...state, turn: endTurn(turn) }, events: [{ kind: 'banked', player, amount }] };
    }
    default:
      throw new TypeError(`pig-fixture extend: unknown intent kind "${intent.kind}"`);
  }
}

/** The complete `Cartridge` — `replay`/`serialize`/`deserialize` for free from `gameRules`. */
export const pigCartridge = gameRules(initialPosition, extend);
