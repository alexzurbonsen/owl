import { findMatches } from './addresses.js';
import { loadWatchlist } from './watchlist.js';

export function createSendCheck({ storage, parseMailbox, ask, reportError }) {
  return async (tab, details) => {
    let warning;
    try {
      const addresses = await loadWatchlist(storage);
      // An intentionally empty list needs no verification or recipient parsing.
      if (addresses.length === 0) return { cancel: false };
      const matches = await findMatches(details, new Set(addresses), parseMailbox);
      if (matches.length === 0) return { cancel: false };
      warning = { kind: 'match', matches };
    } catch (error) {
      reportError(error);
      warning = {
        kind: 'error',
        reason: error instanceof Error ? error.message : 'An unexpected error interrupted the check.'
      };
    }
    try {
      return { cancel: (await ask(tab, warning)) !== true };
    } catch (error) {
      // If the warning itself fails, there is no user-approved override.
      reportError(error);
      return { cancel: true };
    }
  };
}
