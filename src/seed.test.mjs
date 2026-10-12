import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed } from './seed.mjs';

test('dailySeed: namespaces every parlor game under "parlor:" before delegating to cartridge', () => {
  const date = new Date(Date.UTC(2026, 7, 19));
  assert.equal(dailySeed('yacht-dice', date), 'parlor:yacht-dice-daily:2026-08-19');
});

test('dailySeed: pure function of (gameId, date, configId) — same inputs, same output', () => {
  const date = new Date(Date.UTC(2026, 7, 19));
  const s1 = dailySeed('slot-parlor', date, 'classic');
  const s2 = dailySeed('slot-parlor', date, 'classic');
  assert.equal(s1, s2);
});

test('dailySeed: a Date and its equivalent YYYY-MM-DD string resolve to the same seed', () => {
  const date = new Date(Date.UTC(2026, 7, 19));
  assert.equal(dailySeed('pig-dice', date), dailySeed('pig-dice', '2026-08-19'));
});

test('dailySeed: rejects an empty gameId', () => {
  assert.throws(() => dailySeed('', '2026-08-19'), TypeError);
});

test('dailySeed: two different parlor games never collide, same day', () => {
  const date = '2026-08-19';
  assert.notEqual(dailySeed('pig-dice', date), dailySeed('farkle-dice', date));
});
