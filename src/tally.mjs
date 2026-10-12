/**
 * tally.mjs — scoring folds for the two accumulate-and-bust dice games (Pig, Farkle) and the
 * fixed-category scoring of Yacht. Standard public rules throughout — the house dice-games
 * corpus (`dice-games-services-section`) is teaching prose only, with no rules-as-data of its
 * own, so every scoring rule here cites the same discipline that section's own lesson uses for
 * craps/backgammon: standard published rules, not a house source. Every function is a pure
 * fold over an already-rolled hand of pips (from
 * `./dice.mjs`) — nothing here rolls dice itself.
 *
 * Farkle scoring uses the common six-dice convention: a single 1 scores 100, a single 5
 * scores 50, three of a kind scores the face value x 100 (three 1s score 1000, the one
 * exception), and each additional die beyond three of a kind doubles that triple's score
 * (four-of-a-kind = double the triple score, five-of-a-kind = quadruple, six-of-a-kind =
 * octuple) — the same "extra dice double" variant `./odds.mjs`'s exhaustive Farkle
 * enumeration checks against by construction, since both read the identical `scoreFarkleHand`.
 */
import { faceCounts, diceTotal } from './dice.mjs';

// ── Pig ──────────────────────────────────────────────────────────────────────────────────────

/** Standard Pig rule: rolling a 1 busts the turn (the accumulated turn total is lost); any
 *  other pip value is added to the running turn total and play may continue or bank. */
export function pigRollOutcome(pip) {
  if (!Number.isInteger(pip) || pip < 1) {
    throw new RangeError(`pigRollOutcome: pip must be a positive integer (got ${pip})`);
  }
  return pip === 1 ? 'bust' : 'continue';
}

/** Fold a sequence of single-die pip rolls (in roll order) into `{ turnTotal, busted }`:
 *  accumulation stops at the first `1` (bust — the turn total resets to 0 and no further pips
 *  in the sequence count), or continues to the sequence's end if none busts it. Pure: the same
 *  `pips` array always folds to the same result, and `pips` is never mutated. */
export function foldPigTurn(pips) {
  if (!Array.isArray(pips)) {
    throw new TypeError('foldPigTurn: pips must be an array of pip values');
  }
  let turnTotal = 0;
  for (const pip of pips) {
    if (pigRollOutcome(pip) === 'bust') {
      return { turnTotal: 0, busted: true };
    }
    turnTotal += pip;
  }
  return { turnTotal, busted: false };
}

/** Bank a turn total into a player's running score: adds `turnTotal` unconditionally (a
 *  caller banks only when `foldPigTurn`'s `busted` was `false` — banking a busted turn is a
 *  logic error the caller must not commit, not something this function silently guards). */
export function pigBank(playerScore, turnTotal) {
  if (!Number.isInteger(playerScore) || playerScore < 0) {
    throw new RangeError(`pigBank: playerScore must be a non-negative integer (got ${playerScore})`);
  }
  if (!Number.isInteger(turnTotal) || turnTotal < 0) {
    throw new RangeError(`pigBank: turnTotal must be a non-negative integer (got ${turnTotal})`);
  }
  return playerScore + turnTotal;
}

// ── Farkle ───────────────────────────────────────────────────────────────────────────────────

const FARKLE_SIDES = 6;

/** Score one Farkle hand (any number of dice, standard six-dice rules, `dice.length` in
 *  `[1, 6]`): triples-and-beyond first (each face's count of 3 or more scores, extra dice
 *  beyond three doubling per die), then every *remaining* unused 1 or 5 scores as a single.
 *  Returns `{ score, breakdown }`, where `breakdown` lists each scoring group
 *  (`{ face, count, points }`) for audit/UI purposes. A hand with `score === 0` is a bust —
 *  see `farkleBust`. */
export function scoreFarkleHand(dice) {
  if (!Array.isArray(dice) || dice.length < 1 || dice.length > FARKLE_SIDES) {
    throw new RangeError(`scoreFarkleHand: dice must have between 1 and ${FARKLE_SIDES} pip values`);
  }
  const counts = faceCounts(dice, FARKLE_SIDES);
  const breakdown = [];
  let score = 0;

  for (let face = 1; face <= FARKLE_SIDES; face++) {
    const count = counts[face];
    if (count >= 3) {
      const tripleScore = face === 1 ? 1000 : face * 100;
      const extra = count - 3;
      const points = tripleScore * 2 ** extra;
      breakdown.push({ face, count, points });
      score += points;
      counts[face] = 0; // consumed by the triple-or-better group
    }
  }

  if (counts[1] > 0) {
    const points = counts[1] * 100;
    breakdown.push({ face: 1, count: counts[1], points });
    score += points;
  }
  if (counts[5] > 0) {
    const points = counts[5] * 50;
    breakdown.push({ face: 5, count: counts[5], points });
    score += points;
  }

  return { score, breakdown };
}

/** A hand busts iff it scores nothing at all — no triple-or-better, no leftover 1s or 5s. */
export function farkleBust(dice) {
  return scoreFarkleHand(dice).score === 0;
}

// ── Yacht ────────────────────────────────────────────────────────────────────────────────────

/** Every scorable Yacht category, in the standard fixed order the game presents them. */
export const YACHT_CATEGORIES = Object.freeze([
  'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
  'full-house', 'four-of-a-kind', 'little-straight', 'big-straight', 'choice', 'yacht',
]);

const NUMBER_CATEGORY_FACE = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };

/** Score a five-dice Yacht hand against one named category, per standard published Yacht
 *  rules: `ones`..`sixes` sum only that face's dice; `full-house` (a triple + a pair) sums all
 *  five dice or scores 0 if the hand isn't a full house; `four-of-a-kind` sums all five dice
 *  if at least four share a face, else 0; `little-straight` (1-2-3-4-5) and `big-straight`
 *  (2-3-4-5-6) score a fixed 30 if matched exactly, else 0; `choice` sums all five dice
 *  unconditionally; `yacht` (all five dice the same face) scores a fixed 50, else 0. */
export function scoreYachtCategory(dice, category) {
  if (!Array.isArray(dice) || dice.length !== 5) {
    throw new RangeError(`scoreYachtCategory: dice must have exactly 5 pip values (got ${dice.length})`);
  }
  if (!YACHT_CATEGORIES.includes(category)) {
    throw new TypeError(`scoreYachtCategory: unknown category "${category}"`);
  }

  if (category in NUMBER_CATEGORY_FACE) {
    const face = NUMBER_CATEGORY_FACE[category];
    return dice.filter((pip) => pip === face).length * face;
  }

  const counts = faceCounts(dice, 6).slice(1); // index 0..5 now maps to face 1..6

  switch (category) {
    case 'full-house': {
      const hasTriple = counts.includes(3);
      const hasPair = counts.includes(2);
      return hasTriple && hasPair ? diceTotal(dice) : 0;
    }
    case 'four-of-a-kind':
      return counts.some((c) => c >= 4) ? diceTotal(dice) : 0;
    case 'little-straight': {
      const sorted = [...dice].sort((a, b) => a - b);
      return sorted.join(',') === '1,2,3,4,5' ? 30 : 0;
    }
    case 'big-straight': {
      const sorted = [...dice].sort((a, b) => a - b);
      return sorted.join(',') === '2,3,4,5,6' ? 30 : 0;
    }
    case 'choice':
      return diceTotal(dice);
    case 'yacht':
      return counts.includes(5) ? 50 : 0;
    default:
      throw new TypeError(`scoreYachtCategory: unknown category "${category}"`);
  }
}
