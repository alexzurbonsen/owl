import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWarnings } from '../extension/warnings.js';

function event() {
  let listener;
  return {
    addListener: (value) => {
      listener = value;
    },
    emit: (...args) => listener(...args),
  };
}
function fixture(overrides = {}) {
  let id = 0;
  const created = [],
    updated = [],
    removed = [];
  const api = {
    runtime: {
      id: 'owl@owl.local',
      getURL: (path) => 'moz-extension://test/' + path,
      onMessage: event(),
    },
    windows: {
      onRemoved: event(),
      create: async (info) => {
        created.push(info);
        const windowId = ++id;
        return { id: windowId, tabs: [{ id: windowId + 10 }] };
      },
      remove: async (windowId) => {
        removed.push(windowId);
      },
    },
    tabs: {
      onRemoved: event(),
      update: async (tabId, info) => {
        updated.push({ tabId, ...info });
      },
    },
  };
  Object.assign(api.windows, overrides.windows);
  Object.assign(api.tabs, overrides.tabs);
  const ask = createWarnings(api, () => 'token-' + (id + 1));
  const sender = (number) => ({
    id: api.runtime.id,
    url: api.runtime.getURL('warning.html') + '?token=token-' + number,
    tab: { windowId: number },
  });
  return { api, ask, created, updated, removed, sender };
}
const tick = () => new Promise(setImmediate);
const warning = { kind: 'match', matches: [{ field: 'to', address: 'secret@example.com' }] };

test('popup URL contains only a token; warning data requires its own sender', async () => {
  const f = fixture();
  const result = f.ask({ id: 50 }, warning);
  await tick();
  assert.equal(f.created[0].url, 'about:blank');
  assert.equal(f.updated[0].url, 'moz-extension://test/warning.html?token=token-1');
  for (const sender of [
    {},
    { ...f.sender(1), id: 'other' },
    { ...f.sender(1), url: 'moz-extension://test/options.html' },
    { ...f.sender(1), tab: { windowId: 9 } },
  ])
    await assert.rejects(
      f.api.runtime.onMessage.emit({ type: 'owl:warning', token: 'token-1' }, sender),
    );
  assert.deepEqual(
    await f.api.runtime.onMessage.emit({ type: 'owl:warning', token: 'token-1' }, f.sender(1)),
    warning,
  );
  await f.api.runtime.onMessage.emit(
    { type: 'owl:decision', token: 'token-1', approved: true },
    f.sender(1),
  );
  assert.equal(await result, true);
  await assert.rejects(
    f.api.runtime.onMessage.emit({ type: 'owl:warning', token: 'token-1' }, f.sender(1)),
  );
});

test('closing popup cancels without trying to remove the already-closed window', async () => {
  const f = fixture();
  const result = f.ask({ id: 50 }, warning);
  await tick();
  f.api.windows.onRemoved.emit(1);
  assert.equal(await result, false);
  assert.deepEqual(f.removed, []);
});

test('explicit Cancel and Send decisions each remove the popup once', async () => {
  for (const approved of [false, true]) {
    const f = fixture();
    const result = f.ask({ id: 50 }, warning);
    await tick();
    await f.api.runtime.onMessage.emit(
      { type: 'owl:decision', token: 'token-1', approved },
      f.sender(1),
    );
    assert.equal(await result, approved);
    f.api.windows.onRemoved.emit(1);
    assert.deepEqual(f.removed, [1]);
  }
});

test('closing compose tab cancels and cleans up popup', async () => {
  const f = fixture();
  const result = f.ask({ id: 50 }, warning);
  await tick();
  f.api.tabs.onRemoved.emit(50);
  assert.equal(await result, false);
  assert.deepEqual(f.removed, [1]);
});

test('popup creation or navigation failures reject', async () => {
  const one = fixture({
    windows: {
      create: async () => {
        throw new Error('Cannot create');
      },
    },
  });
  await assert.rejects(one.ask({ id: 1 }, warning));
  const two = fixture({
    tabs: {
      update: async () => {
        throw new Error('Cannot navigate');
      },
    },
  });
  await assert.rejects(two.ask({ id: 1 }, warning));
  assert.deepEqual(two.removed, [1]);
});

test('malformed created popup is closed rather than orphaned', async () => {
  const f = fixture({ windows: { create: async () => ({ id: 1, tabs: [] }) } });
  await assert.rejects(f.ask({ id: 50 }, warning));
  assert.deepEqual(f.removed, [1]);
});

test('closing a popup before create resolves still cancels', async () => {
  const f = fixture();
  f.api.windows.create = async () => {
    f.api.windows.onRemoved.emit(1);
    return { id: 1, tabs: [{ id: 11 }] };
  };
  assert.equal(await f.ask({ id: 50 }, warning), false);
  assert.equal(f.updated.length, 0);
  assert.deepEqual(f.removed, []);
});

test('compose close during creation does not leave an orphaned popup', async () => {
  const f = fixture();
  f.api.windows.create = async () => {
    f.api.tabs.onRemoved.emit(50);
    return { id: 1, tabs: [{ id: 11 }] };
  };
  assert.equal(await f.ask({ id: 50 }, warning), false);
  assert.deepEqual(f.removed, [1]);
});

test('parallel compose windows cannot approve each other', async () => {
  const f = fixture();
  const first = f.ask({ id: 50 }, warning);
  await tick();
  const second = f.ask({ id: 60 }, { kind: 'error', reason: 'Test failure' });
  await tick();
  await assert.rejects(
    f.api.runtime.onMessage.emit(
      { type: 'owl:decision', token: 'token-1', approved: true },
      f.sender(2),
    ),
  );
  await f.api.runtime.onMessage.emit(
    { type: 'owl:decision', token: 'token-2', approved: true },
    f.sender(2),
  );
  f.api.windows.onRemoved.emit(1);
  assert.equal(await first, false);
  assert.equal(await second, true);
});

test('malformed decisions cannot approve', async () => {
  const f = fixture();
  const result = f.ask({ id: 50 }, warning);
  await tick();
  await assert.rejects(
    f.api.runtime.onMessage.emit(
      { type: 'owl:decision', token: 'token-1', approved: 'yes' },
      f.sender(1),
    ),
  );
  f.api.windows.onRemoved.emit(1);
  assert.equal(await result, false);
});
