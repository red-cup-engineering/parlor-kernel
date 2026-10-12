# @red-cup-engineering/parlor-kernel

The shared kernel for the parlor shelf: dice games, chance games, a practice-only slot
machine, and board-race games (chutes-and-ladders and its "silly" siblings). One small
kernel — games are data plus a thin face on top of this package, not five separate
reimplementations of dice math, turn order, board graphs, or odds arithmetic.

Packaged cartridge-style: **runtime source is `.mjs`, not `.mts`.** Node refuses to
type-strip `.mts`/`.ts` once it is resolved from inside a `node_modules` directory
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so a package meant to be `npm install`ed
cannot ship `.mts` as its actual entry points. This package's `.mjs` runtime plus
hand-written, co-located `.d.ts` files handle that. `.test.mts` files stay `.mts` — they
run via `node --test` from this package's own directory during development, never
resolved through a consumer's `node_modules`.

Zero runtime dependencies beyond `@red-cup-engineering/gaming/running`.

## Install

```sh
npm install @red-cup-engineering/parlor-kernel --registry http://127.0.0.1:4873/
```

## What's here

- **`@red-cup-engineering/parlor-kernel/seed`** — `dailySeed(gameId, date, configId?)`, a thin
  namespacing wrapper (`parlor:<gameId>`) over `@red-cup-engineering/gaming/running/seed`'s own
  `dailySeed`, so every parlor game's daily seed lives in one collision-free space; and
  `makeRng(seedString)`, an FNV-1a → mulberry32 PRNG construction. "The day's dice are the
  daily seed's dice" is this module, full stop — nothing downstream reads `Date.now()` or
  calls `Math.random()`.
- **`@red-cup-engineering/parlor-kernel/dice`** — seeded rolls over an injected `Rng` stream
  (`rollDie`, `rollDice`, `diceTotal`, `faceCounts`), a cartridge-`GameEvent`-shaped
  roll-log entry builder (`rollLogEntry`), and *exact* probability-mass-function
  generators (`diePmf`, `diceSumPmf`) built by convolution, not sampling.
- **`@red-cup-engineering/parlor-kernel/turns`** — a generic turn/round loop as a pure reducer over
  intents: `createTurnState`, `endTurn`, `withData`/`withPhase`, and
  `createTurnReducer(handlers)`, which turns a game's own
  `{ [intentKind]: handler }` map into a `(state, intent) => { state, events }` function
  matching `@red-cup-engineering/gaming/running/rules`'s `Cartridge.applyIntent` shape directly.
- **`@red-cup-engineering/parlor-kernel/board`** — a race-track board as a directed graph:
  `createBoard(size, jumps)`, `edgesFrom`, `jumpAt`, `resolveMove`, `reachableNodes`. A
  chute and a ladder are **one** edge kind (`jump`), distinguished only by the sign of
  `delta = to - from` — `resolveMove` never branches on chute-vs-ladder.
- **`@red-cup-engineering/parlor-kernel/tally`** — scoring folds: `pigRollOutcome`/`foldPigTurn`/
  `pigBank` for Pig's bust-and-bank loop; `scoreFarkleHand`/`farkleBust` for standard
  six-dice Farkle (triples-double-per-extra-die convention); `scoreYachtCategory` over
  all 12 standard Yacht categories.
- **`@red-cup-engineering/parlor-kernel/odds`** — **computed**, not asserted, odds: exact Pig/Farkle
  bust probabilities (`pigBustProbability`, `farkleBustProbability`, both by exhaustive
  enumeration), exact Yacht category expectations (`yachtCategoryExpectations`, over all
  7,776 five-dice outcomes), and slot RTP from reel data plus a paytable
  (`computeSlotRTP`) — the module that makes a published RTP figure auditable rather than
  a trust-me string. See "On `gambling-services-section`" below.
- **`@red-cup-engineering/parlor-kernel/reels`** — slot reels as data (`createReel`/`createReels`),
  seeded spins (`spinReel`/`spinReels`), and per-symbol hit odds derived directly from a
  reel's own symbol multiset (`symbolHitOdds`) — never a hand-typed number.
- **`@red-cup-engineering/parlor-kernel/paylines`** (added 0.3.0, 2026-08-29, for Cowrie Casino's
  "Tideline Treasures") — the multi-reel, multi-row, multi-payline generalization of `reels`/
  `odds`'s single-symbol-per-reel model: `spinReelWindow`/`spinGrid` draw a uniformly-random,
  wraparound-windowed grid (the standard "weighted reel strip" a real video slot uses);
  `evaluateLine`/`evaluateSpin` walk a payline (or every payline) with wild substitution and a
  scatter-anywhere pay; `computeMultiLineSlotRTP` is `computeSlotRTP`'s exact-full-enumeration
  discipline extended to a grid + many paylines, additionally returning the exact scatter-count
  distribution (`scatterCountDistribution`) and trigger probability a game's own free-spin math
  composes analytically on top of; `symbolAtRowOdds`/`computeJackpotOdds` give the exact
  probability of one rare symbol combination landing (a jackpot's own published odds). Purely
  additive — `reels.mjs`/`odds.mjs`'s existing exports and every existing consumer (parlor-service's
  three-reel single-line "Fair Spin") are unchanged and untouched.
- **`@red-cup-engineering/parlor-kernel/disclosure`** — the reversible/priced/terminal spend
  classifier every game on the shelf shares, per `wilder-conceptions-01.md` item 7
  ("Terminal Bets"), adopted as a design directive for the gambling series ("the honesty
  friction is the product, not a tax on it"). `createClassifier(mapping)` builds an
  exhaustive, throws-on-unclassified `classify` function from a game's own intent-kind →
  spend-type map; `namedCost` and `ruinDisclosure` are the pre-commit-computable
  cost/ruin figures a UI shows *before* a commit button does anything irreversible.
- **`@red-cup-engineering/parlor-kernel/fixtures/pig-fixture`** — a small, real Pig implementation
  built entirely from this package's own modules, used by this package's tests to prove
  the whole kernel-to-rules path round-trips end to end, and available to any parlor
  game's own tests as a worked example of turning kernel pieces into game rules.

A parlor game's rules are assembled by the gaming faculty's
`@red-cup-engineering/gaming/running/rules` (`gameRules(initialPosition, extend)`, `replayPlay`,
`playVerifier`, `hashPosition`); its play record is `@red-cup-engineering/gaming/running/play-record`.
- **`@red-cup-engineering/parlor-kernel`** (bare) — re-exports every module above except the
  fixture, matching `@red-cup-engineering/gaming/running`'s own barrel convention.

## On `gambling-services-section`

`services/science-services-section/services/agent-services-section/services/play-services-section/services/game-science-services-section/services/
gambling-services-section` (`@lenticule-science/gambling-analysis-service`) has real,
tested `kelly.mjs`/`odds.mjs` — but it is Lenticule Science's advantage-play toolkit for
binary prediction-market contracts (Kelly staking fractions, vig/overround removal on
`(0,1)`-priced books), not casino-game math, and it is neither an `@561-group/*` package
nor published to the house Verdaccio registry. This package's `./odds` module consumes
that prior art by **citation, not import** — `odds.mjs`'s own header names it as the
closest existing staking-math precedent and stops there. Every bust/expectation/RTP
figure in `./odds` is original to this package, computed by exhaustive enumeration.

## Determinism

No module here reads `Date.now()` or calls `Math.random()`. Every source of randomness is
`./seed.mjs#makeRng`'s seeded FNV-1a → mulberry32 stream, given a seed string a caller
derived (directly, or via `./seed.mjs#dailySeed`). A `Cartridge` state that needs
per-intent randomness (e.g. `fixtures/pig-fixture.mjs`'s dice rolls) derives a *fresh*
sub-seed per intent from a monotonic counter carried in state (`${seed}:roll:${count}`)
rather than holding a live `Rng` across calls — `Rng` streams are stateful and not
JSON-safe, so they can never live inside a replayable `State` itself.

## Development

```sh
npm run check   # node --check over every src/*.mjs and src/fixtures/*.mjs
npm test        # node --test over every src/*.test.mts and src/fixtures/*.test.mts
npm run check && npm test  # both
```

## License

No `license` field is declared. Published only to the private Verdaccio registry at
`http://127.0.0.1:4873/`, not to the public npm registry.
