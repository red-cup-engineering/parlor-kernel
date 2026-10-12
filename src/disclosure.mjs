/**
 * disclosure.mjs — the three-way spend-typing classifier every game on the parlor shelf
 * shares: `'reversible'` / `'priced'` / `'terminal'`, per `wilder-conceptions-01.md` item 7
 * ("Terminal Bets") and its adoption as a design directive for the gambling series: "the
 * shelf's positioning IS trust... the honesty friction is the product, not a tax on it."
 * The precedent is `gambling-trainer-service/src/disclosure.mts`:
 * an exhaustive `switch` over one game's own intent-kind union, throwing on anything
 * unclassified, so a new intent kind added without a matching case fails loudly instead of
 * silently defaulting to "looks free."
 *
 * This kernel module can't hard-code any one game's intent-kind union — five different parlor
 * games each declare their own `Intent` shapes, none of which this package knows about. So
 * `classify` here is a *factory*: a game hands its own `{ [intentKind]: SpendType }` mapping
 * once, gets back a function with the exact same exhaustive-and-throws behavior the
 * gambling-trainer precedent has, without re-deriving the switch/throw boilerplate five times.
 * The `namedCost`/`ruinDisclosure` helpers are likewise generalized: they take the already-
 * computed numbers a game's own engine produced (a cost amount, a loss probability) rather
 * than reaching into a game-specific `BankrollState`, so this module stays as ignorant of any
 * one game's state shape as `./turns.mjs` and `./board.mjs` are.
 */

const SPEND_TYPES = new Set(['reversible', 'priced', 'terminal']);

/** Build a `classify(intentKind)` function from a game's own
 *  `{ [intentKind]: 'reversible' | 'priced' | 'terminal' }` mapping. The mapping is validated
 *  up front (every value must be one of the three spend types) so a typo in the game's own
 *  table fails at construction, not the first time a player happens to trigger that intent
 *  kind. The returned function throws on any `kind` absent from the mapping — the same
 *  "unclassified kind is a defect, not a silent default" guarantee the gambling-trainer
 *  precedent gives, now reusable per game instead of hand-rolled per game. */
export function createClassifier(mapping) {
  if (typeof mapping !== 'object' || mapping === null) {
    throw new TypeError('createClassifier: mapping must be an object of intentKind -> SpendType');
  }
  for (const [kind, type] of Object.entries(mapping)) {
    if (!SPEND_TYPES.has(type)) {
      throw new TypeError(`createClassifier: mapping["${kind}"] = ${JSON.stringify(type)} is not a valid SpendType`);
    }
  }
  return function classify(kind) {
    const type = mapping[kind];
    if (type === undefined) {
      throw new TypeError(`classify: unclassified intent kind "${kind}" — every intent kind must be typed`);
    }
    return type;
  };
}

/** A named, quantified cost for a `priced` spend: a positive `amount` off a named `resource`,
 *  plus the human-readable `description` a UI shows verbatim — the shape
 *  `gambling-trainer-service`'s `namedCost` returns, generalized to take already-computed
 *  numbers instead of reaching into a game-specific state object. A `priced` intent whose
 *  cost a game cannot compute is a defect the game's own code must not hide behind this
 *  helper — this function only ever wraps a caller-supplied, already-known amount. */
export function namedCost(amount, resource, description) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`namedCost: amount must be a non-negative number (got ${amount})`);
  }
  if (typeof resource !== 'string' || resource.length === 0) {
    throw new TypeError('namedCost: resource must be a non-empty string');
  }
  if (typeof description !== 'string' || description.length === 0) {
    throw new TypeError('namedCost: description must be a non-empty string');
  }
  return { amount, resource, description };
}

/**
 * The ruin disclosure for a proposed terminal spend, computable purely from pre-commit values
 * — `balance` (current stakeable resource), `stakeAmount` (what this spend would commit), and
 * `lossProbability` (the game's own computed probability of losing this spend) — exactly what
 * lets a UI show this *before* a commit button does anything irreversible, per the
 * gambling-trainer precedent's "the ruin disclosure precedes ruin" test. `ruinThreshold`
 * (default `0`) is the balance below which a run is considered ruined; "this stake causes
 * ruin" means `balance - stakeAmount <= ruinThreshold` *and* the spend is lost.
 */
export function ruinDisclosure(balance, stakeAmount, lossProbability, ruinThreshold = 0) {
  if (!Number.isFinite(balance) || balance < 0) {
    throw new RangeError(`ruinDisclosure: balance must be a non-negative number (got ${balance})`);
  }
  if (!Number.isFinite(stakeAmount) || stakeAmount < 0) {
    throw new RangeError(`ruinDisclosure: stakeAmount must be a non-negative number (got ${stakeAmount})`);
  }
  if (!Number.isFinite(lossProbability) || lossProbability < 0 || lossProbability > 1) {
    throw new RangeError(`ruinDisclosure: lossProbability must be in [0, 1] (got ${lossProbability})`);
  }
  const wouldRuin = balance - stakeAmount <= ruinThreshold;
  const ruinProbability = wouldRuin ? lossProbability : 0;
  const text = wouldRuin
    ? `This spend is terminal. If you lose, this run ends here — your balance would fall to or below ${ruinThreshold}. P(lose this stake): ${(100 * lossProbability).toFixed(1)}%. P(this stake causes ruin): ${(100 * ruinProbability).toFixed(1)}%.`
    : `This spend is terminal. If you lose, it's gone for this run, but your remaining balance stays stakeable. P(lose this stake): ${(100 * lossProbability).toFixed(1)}%. P(this stake causes ruin): 0%.`;
  return { probability: ruinProbability, text };
}
