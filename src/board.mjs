/**
 * board.mjs — a race-track board as a directed graph: a linear run of `size + 1` nodes
 * (`0` the start, `size` the goal) joined by default sequential **move edges** (`n -> n+1`),
 * overridable at specific nodes by **jump edges**.
 *
 * The house board-games corpus has no engineering content outside weiqi, so this is a
 * clean-room design — but it is deliberately general enough to seat any race-track board,
 * chutes-and-ladders included: a "chute" and a "ladder" are not two kinds
 * of edge, they are *one* kind (`jump`) read through a `delta = to - from` that happens to be
 * negative or positive. `resolveMove` never branches on chute-vs-ladder; there is exactly one
 * code path from a landed-on node to wherever its jump edge (if any) sends the piece next, and
 * the sign of `delta` is the only thing distinguishing a "chute" from a "ladder" anywhere in
 * this module — `board.test.mts` proves this by running the identical `resolveMove` call
 * against a `delta < 0` jump and a `delta > 0` jump and asserting both take the same branch.
 *
 * A grid or non-linear board is a natural extension (the graph shape supports arbitrary
 * `from -> to` edges already) but is out of scope here: every jump edge in this module's
 * `createBoard` is anchored to the fixed `0..size` linear node numbering a race-track board
 * uses, matching the parlor shelf's board-race and "silly" board-game targets.
 */

function assertSize(size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`board: size must be a positive integer (got ${size})`);
  }
}

function assertNode(node, size, label = 'node') {
  if (!Number.isInteger(node) || node < 0 || node > size) {
    throw new RangeError(`board: ${label} ${node} is outside [0, ${size}]`);
  }
}

/**
 * Build a board graph: `size + 1` nodes numbered `0` (start) to `size` (goal), a move edge
 * `n -> n+1` for every `n` in `[0, size - 1]`, and one jump edge per `{ from, to }` in
 * `jumps` overriding what landing on `from` means. `kind` is derived, never supplied: `'chute'`
 * when `to < from`, `'ladder'` when `to > from` — a jump with `to === from` is rejected as
 * meaningless. No node may be the `from` of more than one jump (ambiguous landing), and a
 * jump's `to` may not itself be a jump's `from` (chained jumps are refused rather than silently
 * resolved) — both are house-standard "reject the ambiguous case at construction, not at
 * traversal time" discipline, matching manifest.mjs's collect-every-error validation style.
 */
export function createBoard(size, jumps = []) {
  assertSize(size);
  if (!Array.isArray(jumps)) {
    throw new TypeError('createBoard: jumps must be an array of { from, to }');
  }

  const jumpFrom = {};
  for (const j of jumps) {
    if (typeof j !== 'object' || j === null) {
      throw new TypeError('createBoard: each jump must be an object with from/to');
    }
    assertNode(j.from, size, 'jump.from');
    assertNode(j.to, size, 'jump.to');
    if (j.from === 0 || j.from === size) {
      throw new RangeError(`createBoard: jump.from ${j.from} may not be the start or goal node`);
    }
    if (j.to === j.from) {
      throw new RangeError(`createBoard: jump ${j.from} -> ${j.to} has no effect (to === from)`);
    }
    if (Object.hasOwn(jumpFrom, j.from)) {
      throw new RangeError(`createBoard: node ${j.from} already has a jump — a node may not have two`);
    }
    jumpFrom[j.from] = { from: j.from, to: j.to, delta: j.to - j.from, kind: j.to > j.from ? 'ladder' : 'chute' };
  }
  for (const j of Object.values(jumpFrom)) {
    if (Object.hasOwn(jumpFrom, j.to)) {
      throw new RangeError(`createBoard: chained jumps are not allowed (${j.from} -> ${j.to}, and ${j.to} itself jumps)`);
    }
  }

  return { size, jumps: jumpFrom };
}

/** The edge(s) actually leaving `node`. If `node` has a jump, landing there always redirects
 *  immediately (exactly what `resolveMove` does — a jump fires before any further move is
 *  considered), so the jump is `node`'s *only* outgoing edge, overriding the default
 *  sequential edge rather than adding a second one — one node, one effective transition, per
 *  the "chute/ladder is an edge annotation that overrides, not appends" design. Absent a jump,
 *  it's the sequential `node -> node+1` move edge (absent at the goal node, which has none). */
export function edgesFrom(board, node) {
  assertNode(node, board.size);
  const jump = (Object.hasOwn(board.jumps, node) ? board.jumps[node] : undefined);
  if (jump !== undefined) {
    return [{ from: jump.from, to: jump.to, kind: jump.kind, delta: jump.delta }];
  }
  if (node < board.size) {
    return [{ from: node, to: node + 1, kind: 'move', delta: 1 }];
  }
  return [];
}

/** The jump edge landing on `node`, or `undefined` if `node` has none. */
export function jumpAt(board, node) {
  assertNode(node, board.size);
  return (Object.hasOwn(board.jumps, node) ? board.jumps[node] : undefined);
}

/**
 * Move a piece `steps` sequential nodes forward from `from` (clamped at the goal — a roll that
 * would overshoot `size` lands exactly on `size`, the common race-game convention), then apply
 * that landing node's jump edge if it has one. Returns the full path taken (`from`, every
 * intermediate sequential node, the pre-jump landing, and — if a jump fired — the post-jump
 * node), so a caller can log or animate every step, not just the destination.
 *
 * This is the one code path both a chute and a ladder travel through: `landedAt` is computed
 * purely from `edgesFrom`/`jumpAt`, and nothing here inspects `delta`'s sign.
 */
export function resolveMove(board, from, steps) {
  assertNode(from, board.size, 'from');
  if (!Number.isInteger(steps) || steps < 0) {
    throw new RangeError(`resolveMove: steps must be a non-negative integer (got ${steps})`);
  }
  const path = [from];
  let at = from;
  for (let i = 0; i < steps && at < board.size; i++) {
    at += 1;
    path.push(at);
  }
  const preJump = at;
  const jump = jumpAt(board, at);
  if (jump !== undefined) {
    at = jump.to;
    path.push(at);
  }
  return { from, preJump, landedAt: at, jumped: jump !== undefined, jumpKind: jump?.kind ?? null, path };
}

/** Breadth-first traversal of every node reachable from `start` by following move edges alone
 *  (jump edges included implicitly, since a piece that lands on a jump's `from` is immediately
 *  redirected — `edgesFrom` already encodes that). Returns nodes in visitation order. Bounded by
 *  `board.size + 1` nodes, so this always terminates even on a board with only jump edges. */
export function reachableNodes(board, start) {
  assertNode(start, board.size);
  const seen = new Set([start]);
  const queue = [start];
  const order = [];
  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);
    for (const edge of edgesFrom(board, node)) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return order;
}
