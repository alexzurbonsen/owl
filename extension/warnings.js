// No addresses in URLs or persistent storage. Decisions belong to one popup.
export function createWarnings(api, makeId) {
  const pending = new Map();
  const closedWindows = new Set();
  let opening = 0;

  function finish(token, approved) {
    const entry = pending.get(token);
    if (!entry) return;
    pending.delete(token);
    entry.resolve(approved);
    if (entry.windowId !== null) {
      api.windows
        .remove(entry.windowId)
        .catch((error) => console.error('Owl could not close a completed warning.', error));
    }
  }

  function trustedEntry(message, sender) {
    if (sender?.id !== api.runtime.id || typeof message?.token !== 'string') return null;
    const entry = pending.get(message.token);
    if (!entry || entry.windowId === null || sender.tab?.windowId !== entry.windowId) return null;
    if (sender.url !== api.runtime.getURL('warning.html') + '?token=' + message.token) return null;
    return entry;
  }

  api.runtime.onMessage.addListener((message, sender) => {
    if (!['owl:warning', 'owl:decision'].includes(message?.type)) return undefined;
    const entry = trustedEntry(message, sender);
    if (!entry)
      return Promise.reject(
        new Error('This warning is no longer active. Sending was not approved.'),
      );
    if (message.type === 'owl:warning') return Promise.resolve(entry.warning);
    if (typeof message.approved !== 'boolean')
      return Promise.reject(new Error('Invalid warning decision.'));
    finish(message.token, message.approved);
    return Promise.resolve({ accepted: true });
  });

  api.windows.onRemoved.addListener((windowId) => {
    if (opening > 0) closedWindows.add(windowId);
    for (const [token, entry] of pending) {
      if (entry.windowId === windowId) finish(token, false);
    }
  });

  api.tabs.onRemoved.addListener((tabId) => {
    for (const [token, entry] of pending) {
      if (entry.composeTabId === tabId) finish(token, false);
    }
  });

  return async function ask(tab, warning) {
    const token = makeId();
    let resolve;
    const decision = new Promise((done) => {
      resolve = done;
    });
    const entry = { warning, composeTabId: tab.id, windowId: null, resolve };
    pending.set(token, entry);
    opening++;
    try {
      // about:blank is a deliberate handshake: establish the popup's identity
      // before its page can request sensitive data or return a decision.
      const popup = await api.windows.create({
        type: 'popup',
        url: 'about:blank',
        width: 520,
        height: 440,
      });
      if (Number.isInteger(popup.id)) entry.windowId = popup.id;
      if (entry.windowId === null || !Number.isInteger(popup.tabs?.[0]?.id))
        throw new Error('Could not create a warning window.');
      if (!pending.has(token) || closedWindows.has(popup.id)) {
        api.windows
          .remove(popup.id)
          .catch((error) => console.error('Owl could not close a cancelled warning.', error));
        finish(token, false);
      } else {
        await api.tabs.update(popup.tabs[0].id, {
          url: api.runtime.getURL('warning.html') + '?token=' + token,
        });
      }
    } catch (error) {
      finish(token, false);
      throw error;
    } finally {
      opening--;
      if (opening === 0) closedWindows.clear();
    }
    return decision;
  };
}
