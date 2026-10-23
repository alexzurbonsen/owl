import { createSendCheck } from './send-check.js';
import { createWarnings } from './warnings.js';

const api = messenger;
const ask = createWarnings(api, () => crypto.randomUUID());
const check = createSendCheck({
  storage: api.storage.local,
  // Native defaults flatten concrete mailbox groups and do not expand lists.
  parseMailbox: value => api.messengerUtilities.parseMailboxString(value),
  ask,
  reportError: () => console.error('Owl could not complete recipient verification. Sending requires an explicit override, or is cancelled if no warning can be shown.')
});

// Manifest V2 keeps this background alive while a send awaits its popup decision.
api.compose.onBeforeSend.addListener(check);
