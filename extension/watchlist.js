import { normalizeAddress } from './addresses.js';

export const WATCHLIST_KEY = 'watchlist';

export function validateWatchlist(value) {
  if (!Array.isArray(value))
    throw new Error('The saved watchlist is invalid. Open Owl settings to repair it.');
  return [...new Set(value.map(normalizeAddress))].sort();
}

export async function loadWatchlist(storage) {
  const data = await storage.get(WATCHLIST_KEY);
  if (data[WATCHLIST_KEY] === undefined) return [];
  return validateWatchlist(data[WATCHLIST_KEY]);
}

export async function saveWatchlist(storage, addresses) {
  const validated = validateWatchlist(addresses);
  await storage.set({ [WATCHLIST_KEY]: validated });
  return validated;
}
