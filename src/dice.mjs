/**
 * dice.mjs — seeded dice rolls over an injected `Rng` stream (see `./seed.mjs`), roll-log
 * entries in the cartridge `GameEvent` shape (`{ kind, ...data }`), and exact
 * probability-mass-function generators for a given dice configuration.
 *
 * Vocabulary matches the house dice-games glossary (`dice-games-services-section`) exactly:
 * a **roll** produces one or more **pip** values (the face shown), whose sum is the
 * **dice-total**. Nothing here owns an RNG itself — every function that needs randomness
 * takes an already-constructed `Rng` (from `./seed.mjs#seededStream`) as its first argument, so a
 * game controls exactly which seed stream its dice consume and in what order, and two
 * independent dice sub-systems in the same game (e.g. a d6 for movement and a d20 for
 * combat) can be given distinct sub-seeds without this module knowing either exists.
 *
 * The PMF generators (`diePmf`, `diceSumPmf`) are *exact*, not sampled: they enumerate every
 * equally-likely outcome and count, so `./odds.mjs` can build exact bust/expectation figures
 * on top of them rather than estimating from simulated rolls.
 */

function assertSides(sides) {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`dice: sides must be a positive integer (got ${sides})`);
  }
}

function assertCount(count) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`dice: count must be a positive integer (got ${count})`);
  }
}

function assertRng(rng) {
  if (typeof rng?.int !== 'function') {
    throw new TypeError('dice: rng must be an Rng (see ./seed.mjs#seededStream)');
  }
}

/** One pip: an integer in [1, sides], drawn from `rng`. */
export function rollDie(rng, sides = 6) {
  assertRng(rng);
  assertSides(sides);
  return rng.int(1, sides);
}

/** `count` pips, each an independent draw from `rng`, in roll order (order matters for
 *  reproducing a specific playthrough byte-for-byte — this is not sorted or otherwise
 *  normalized). */
export function rollDice(rng, count, sides = 6) {
  assertRng(rng);
  assertCount(count);
  assertSides(sides);
  const dice = new Array(count);
  for (let i = 0; i < count; i++) dice[i] = rollDie(rng, sides);
  return dice;
}

/** The dice-total: the sum of a set of pip values. */
export function diceTotal(dice) {
  if (!Array.isArray(dice) || dice.length === 0) {
    throw new TypeError('diceTotal: dice must be a non-empty array of pip values');
  }
  return dice.reduce((sum, pip) => sum + pip, 0);
}

/** How many of each face value appear in `dice` — index 0 unused, index `k` is the count of
 *  pip value `k`. Shared helper every scoring fold (tally.mjs) and RTP-style enumeration
 *  needs, so it lives once, here. */
export function faceCounts(dice, sides = 6) {
  assertSides(sides);
  const counts = new Array(sides + 1).fill(0);
  for (const pip of dice) {
    if (!Number.isInteger(pip) || pip < 1 || pip > sides) {
      throw new RangeError(`faceCounts: pip ${pip} is out of range for a ${sides}-sided die`);
    }
    counts[pip] += 1;
  }
  return counts;
}

/** A roll-log entry in the cartridge `GameEvent` envelope (`{ kind: string, ...data }`) —
 *  the shared shape every parlor game's `extend` can push straight into its own events
 *  array without hand-rolling the field names each time. `dice` is copied defensively so the
 *  logged entry can never be mutated by later reuse of the same array. */
export function rollLogEntry(dice, sides = 6) {
  if (!Array.isArray(dice) || dice.length === 0) {
    throw new TypeError('rollLogEntry: dice must be a non-empty array of pip values');
  }
  assertSides(sides);
  return { kind: 'dice-roll', sides, dice: [...dice], total: diceTotal(dice) };
}

/** The exact probability mass function of a single `sides`-sided fair die: an array of
 *  `{ pip, probability }` for `pip` in `[1, sides]`, each with probability `1/sides`. */
export function diePmf(sides = 6) {
  assertSides(sides);
  const probability = 1 / sides;
  const pmf = [];
  for (let pip = 1; pip <= sides; pip++) pmf.push({ pip, probability });
  return pmf;
}

/** The exact probability mass function of the dice-total of `count` fair `sides`-sided dice,
 *  built by convolving `count` copies of `diePmf(sides)` (dynamic programming over the
 *  running-sum distribution, not sampling) — an array of `{ total, ways, probability }`
 *  ordered by ascending `total`, where `ways` is the exact outcome count out of `sides **
 *  count` equally likely outcomes. Exact for any `count`/`sides` the caller can afford to
 *  enumerate; parlor games use this at Pig/Farkle/board-race scale (one to a handful of
 *  dice), where `sides ** count` never exceeds a few thousand. */
export function diceSumPmf(count, sides = 6) {
  assertCount(count);
  assertSides(sides);
  let ways = new Map([[0, 1]]);
  for (let i = 0; i < count; i++) {
    const next = new Map();
    for (const [sum, w] of ways) {
      for (let pip = 1; pip <= sides; pip++) {
        const total = sum + pip;
        next.set(total, (next.get(total) ?? 0) + w);
      }
    }
    ways = next;
  }
  const totalOutcomes = sides ** count;
  return [...ways.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([total, w]) => ({ total, ways: w, probability: w / totalOutcomes }));
}
