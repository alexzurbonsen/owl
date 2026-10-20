import { createSendCheck } from './send-check.js';
import { createWarnings } from './warnings.js';

const api = messenger;
const ask = createWarnings(api, () => crypto.randomUUID());
const check = createSendCheck({
  storage: api.storage.local,
  // Native defaults flatten concrete mailbox groups and do not expand lists.
  parseMailbox: value => api.messengerUtilities.parseMailboxString(value),
  ask,
  reportError: () => console.error('Parrot could not complete recipient verification. Sending requires an explicit override, or is cancelled if no warning can be shown.')
});

// Register at module load so Thunderbird can wake an MV3 event page on Send.
api.compose.onBeforeSend.addListener(check);
