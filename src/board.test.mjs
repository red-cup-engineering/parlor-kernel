import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, edgesFrom, jumpAt, resolveMove, reachableNodes } from './board.mjs';

test('createBoard: default move edges are sequential, node -> node+1, none past the goal', () => {
  const board = createBoard(5);
  assert.deepEqual(edgesFrom(board, 0), [{ from: 0, to: 1, kind: 'move', delta: 1 }]);
  assert.deepEqual(edgesFrom(board, 4), [{ from: 4, to: 5, kind: 'move', delta: 1 }]);
  assert.deepEqual(edgesFrom(board, 5), []); // goal node has no outgoing move edge
});

test('createBoard: a jump with to > from is labeled "ladder", a jump with to < from is labeled "chute" — sign of delta, nothing else', () => {
  const board = createBoard(20, [
    { from: 3, to: 14 }, // ladder: delta +11
    { from: 17, to: 6 }, // chute: delta -11
  ]);
  const ladder = jumpAt(board, 3);
  const chute = jumpAt(board, 17);
  assert.equal(ladder.kind, 'ladder');
  assert.equal(ladder.delta, 11);
  assert.equal(chute.kind, 'chute');
  assert.equal(chute.delta, -11);
  // The defining claim: a chute IS a ladder with a negative sign — same magnitude, opposite delta.
  assert.equal(Math.abs(ladder.delta), Math.abs(chute.delta));
});

test('resolveMove: a ladder jump resolves through the same code path as any other jump — landedAt is exactly preJump + delta', () => {
  const ladderBoard = createBoard(20, [{ from: 3, to: 14 }]); // delta +11
  const result = resolveMove(ladderBoard, 0, 3);
  assert.equal(result.preJump, 3);
  assert.equal(result.jumped, true);
  assert.equal(result.jumpKind, 'ladder');
  assert.equal(result.landedAt, 14);
  assert.equal(result.landedAt - result.preJump, 11);
});

test('resolveMove: chute and ladder are the same mechanism — proven by symmetric deltas landing symmetric distances from preJump', () => {
  const board = createBoard(30, [
    { from: 5, to: 16 }, // ladder, delta +11
    { from: 20, to: 9 }, // chute, delta -11
  ]);
  const upward = resolveMove(board, 0, 5); // lands on 5, jumps via ladder
  const downward = resolveMove(board, 0, 20); // lands on 20, jumps via chute

  assert.equal(upward.jumped, true);
  assert.equal(downward.jumped, true);
  assert.equal(upward.landedAt - upward.preJump, 11);
  assert.equal(downward.landedAt - downward.preJump, -11);
  // Same |delta|, opposite sign: the one fact that distinguishes a ladder from a chute.
  assert.equal(upward.landedAt - upward.preJump, -(downward.landedAt - downward.preJump));
});

test('resolveMove: a roll landing on a plain node (no jump) stops there', () => {
  const board = createBoard(10, [{ from: 7, to: 2 }]);
  const result = resolveMove(board, 0, 4);
  assert.equal(result.landedAt, 4);
  assert.equal(result.jumped, false);
  assert.equal(result.jumpKind, null);
});

test('resolveMove: a roll that would overshoot the goal clamps exactly to size', () => {
  const board = createBoard(6);
  const result = resolveMove(board, 4, 10);
  assert.equal(result.landedAt, 6);
  assert.equal(result.preJump, 6);
});

test('resolveMove: the returned path lists every sequential node stepped through, plus the post-jump node', () => {
  const board = createBoard(10, [{ from: 3, to: 8 }]);
  const result = resolveMove(board, 0, 3);
  assert.deepEqual(result.path, [0, 1, 2, 3, 8]);
});

test('createBoard: rejects a jump anchored at the start or goal node', () => {
  assert.throws(() => createBoard(10, [{ from: 0, to: 5 }]), RangeError);
  assert.throws(() => createBoard(10, [{ from: 10, to: 5 }]), RangeError);
});

test('createBoard: rejects two jumps sharing the same "from" node (ambiguous landing)', () => {
  assert.throws(() => createBoard(10, [{ from: 4, to: 8 }, { from: 4, to: 2 }]), RangeError);
});

test('createBoard: rejects chained jumps (a jump landing on another jump\'s "from")', () => {
  assert.throws(() => createBoard(20, [{ from: 3, to: 10 }, { from: 10, to: 18 }]), RangeError);
});

test('createBoard: rejects a no-op jump (to === from)', () => {
  assert.throws(() => createBoard(10, [{ from: 4, to: 4 }]), RangeError);
});

test('reachableNodes: walks every node forward from start via move and jump edges, bounded and terminating', () => {
  const board = createBoard(6, [{ from: 3, to: 5 }]);
  const nodes = reachableNodes(board, 0);
  assert.deepEqual(nodes, [0, 1, 2, 3, 5, 6]); // node 4 is skipped: 3 jumps straight to 5
});

test('reachableNodes: terminates even when every intermediate node is skipped by jumps', () => {
  const board = createBoard(4, [{ from: 1, to: 3 }]);
  const nodes = reachableNodes(board, 0);
  assert.deepEqual(nodes, [0, 1, 3, 4]);
});

test('board graph traversal: resolveMove from an arbitrary interior node still respects jump edges', () => {
  const board = createBoard(20, [{ from: 12, to: 4 }]);
  const result = resolveMove(board, 9, 3); // lands on 12 -> chute to 4
  assert.equal(result.preJump, 12);
  assert.equal(result.landedAt, 4);
  assert.equal(result.jumpKind, 'chute');
});
