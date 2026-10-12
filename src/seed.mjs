/**
 * seed.mjs — the parlor shelf's daily seed. `dailySeed(gameId, date, configId?)` namespaces every
 * parlor game under `parlor:` before the gaming faculty's own `dailySeed`, so a parlor game's seed
 * space never collides with another game's. A parlor game draws from its seed with the data
 * section's `seededStream` (`@red-cup-engineering/computer-data-engineering-services-section/randomization/stream`).
 */
import { dailySeed as gamingDailySeed } from '@red-cup-engineering/gaming/running/seed';

/** `date` may be a `Date` (its UTC calendar day is used) or a `YYYY-MM-DD` string. */
export function dailySeed(gameId, date, configId) {
  if (typeof gameId !== 'string' || gameId.length === 0) {
    throw new TypeError('dailySeed: gameId must be a non-empty string');
  }
  return gamingDailySeed(`parlor:${gameId}`, date, configId);
}
