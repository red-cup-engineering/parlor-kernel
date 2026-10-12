import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClassifier, namedCost, ruinDisclosure } from './disclosure.mjs';

const classify = createClassifier({
  'adjust-stake': 'reversible',
  'new-run': 'reversible',
  'reroll-offer': 'priced',
  'commit-stake': 'terminal',
});

test('createClassifier: classifies every mapped intent kind exactly as given', () => {
  assert.equal(classify('adjust-stake'), 'reversible');
  assert.equal(classify('new-run'), 'reversible');
  assert.equal(classify('reroll-offer'), 'priced');
  assert.equal(classify('commit-stake'), 'terminal');
});

test('createClassifier: throws on an unclassified intent kind — new kind, no typing, fails loudly', () => {
  assert.throws(() => classify('mystery-intent'), TypeError);
});

test('createClassifier: rejects a mapping with an invalid SpendType value at construction time', () => {
  assert.throws(() => createClassifier({ 'bad-kind': 'free' }), TypeError);
});

test('createClassifier: rejects a non-object mapping', () => {
  assert.throws(() => createClassifier(null), TypeError);
});

test('namedCost: builds the { amount, resource, description } triple', () => {
  const cost = namedCost(5, 'bankroll', 'Rerolling costs 5 coins.');
  assert.deepEqual(cost, { amount: 5, resource: 'bankroll', description: 'Rerolling costs 5 coins.' });
});

test('namedCost: rejects a negative amount or an empty resource/description', () => {
  assert.throws(() => namedCost(-1, 'bankroll', 'x'), RangeError);
  assert.throws(() => namedCost(5, '', 'x'), TypeError);
  assert.throws(() => namedCost(5, 'bankroll', ''), TypeError);
});

test('ruinDisclosure: a stake that would not bring the balance to or below the threshold is never flagged as ruin', () => {
  const disclosure = ruinDisclosure(100, 10, 0.5, 0);
  assert.equal(disclosure.probability, 0);
  assert.match(disclosure.text, /remaining balance stays stakeable/);
});

test('ruinDisclosure: a stake that would bring the balance to or below the threshold reports the loss probability as the ruin probability', () => {
  const disclosure = ruinDisclosure(10, 10, 0.35, 0);
  assert.equal(disclosure.probability, 0.35);
  assert.match(disclosure.text, /this run ends here/);
});

test('ruinDisclosure: is computable purely from pre-commit values — the same call before any commit gives the same answer a caller would see after (the UI-ordering guarantee)', () => {
  const before = ruinDisclosure(50, 50, 0.4, 0);
  const again = ruinDisclosure(50, 50, 0.4, 0);
  assert.deepEqual(before, again);
});

test('ruinDisclosure: rejects invalid probability, balance, or stake', () => {
  assert.throws(() => ruinDisclosure(-1, 5, 0.5), RangeError);
  assert.throws(() => ruinDisclosure(10, -1, 0.5), RangeError);
  assert.throws(() => ruinDisclosure(10, 5, 1.5), RangeError);
});
