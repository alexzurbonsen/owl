import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import vm from 'node:vm';
import { parseWatchlistInput } from '../extension/addresses.js';
import { loadWatchlist, saveWatchlist } from '../extension/watchlist.js';

const root = new URL('../extension/', import.meta.url);
const tick = () => new Promise(setImmediate);

async function page(name, api) {
  const html = await readFile(new URL(name + '.html', root), 'utf8');
  const { window, document } = parseHTML(html);
  let closed = 0;
  document.querySelector('#addresses')?.setAttribute('value', '');
  if (document.querySelector('#addresses')) document.querySelector('#addresses').value = '';
  const context = vm.createContext({
    window: { addEventListener: window.addEventListener.bind(window), close: () => { closed++; }, confirm: () => true },
    document, messenger: api, location: { search: '?token=test' }, URLSearchParams, console,
    parseWatchlistInput, loadWatchlist, saveWatchlist
  });
  const source = (await readFile(new URL(name + '.js', root), 'utf8')).replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context, { filename: name + '.js' });
  await tick();
  return {
    document, window, closed: () => closed,
    event(selector, type) { document.querySelector(selector).dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })); },
    async click(selector) { this.event(selector, 'click'); await tick(); }
  };
}

test('settings DOM: explicit save, deduplication, validation and removal', async () => {
  let watchlist = [], writes = [];
  const p = await page('options', { storage: { local: { get: async () => ({ watchlist }), set: async data => { watchlist = data.watchlist; writes.push(data); } } } });
  assert.equal(p.document.title, 'Owl · Watched addresses');
  assert.equal(p.document.querySelector('.brand-logo').textContent, '🦉');
  assert.equal(p.document.querySelector('.brand-note').textContent, 'Are you sure?');
  const input = p.document.querySelector('#addresses');
  input.value = 'Jane@Example.com; all-staff@company.com; jane@example.com';
  p.event('#addresses', 'input');
  p.event('#add-form', 'submit');
  assert.equal(p.document.querySelectorAll('#watchlist li').length, 2);
  assert.equal(writes.length, 0);
  await p.click('#save');
  assert.deepEqual(watchlist, ['all-staff@company.com', 'jane@example.com']);
  assert.match(p.document.querySelector('#save-status').textContent, /All changes saved/);
  input.value = 'new@example.com, broken';
  p.event('#addresses', 'input');
  assert.equal(p.document.querySelector('#add').disabled, true);
  assert.equal(p.document.querySelector('#save').disabled, true);
  assert.match(p.document.querySelector('#input-error').textContent, /broken/);
  input.value = ''; p.event('#addresses', 'input');
  await p.click('#watchlist li button');
  assert.equal(p.document.querySelectorAll('#watchlist li').length, 1);
  assert.equal(writes.length, 1);
});

test('settings DOM: failed read is not an empty, writable list', async () => {
  let writes = 0;
  const p = await page('options', { storage: { local: { get: async () => { throw new Error('Unavailable'); }, set: async () => { writes++; } } } });
  assert.equal(p.document.querySelector('#load-error').hidden, false);
  assert.equal(p.document.querySelector('#addresses').disabled, true);
  assert.equal(p.document.querySelector('#save').disabled, true);
  assert.equal(writes, 0);
});

test('settings DOM: failed save retains draft and allows retry', async () => {
  const p = await page('options', { storage: { local: { get: async () => ({ watchlist: ['a@example.com'] }), set: async () => { throw new Error('Save unavailable'); } } } });
  await p.click('#watchlist li button');
  await p.click('#save');
  assert.match(p.document.querySelector('#save-status').textContent, /Save unavailable/);
  assert.equal(p.document.querySelector('#save').disabled, false);
});

test('settings DOM: another tab changing the list prevents a silent overwrite', async () => {
  let state = ['a@example.com'];
  const p = await page('options', { storage: { local: { get: async () => ({ watchlist: state }), set: async () => assert.fail('must not overwrite') } } });
  await p.click('#watchlist li button');
  state = ['new@example.com'];
  await p.click('#save');
  assert.match(p.document.querySelector('#save-status').textContent, /another settings tab/);
});

test('warning DOM: addresses are text; send requires an explicit click', async () => {
  const decisions = [];
  const malicious = '<img src=https://example.invalid/track>';
  const p = await page('warning', { runtime: { sendMessage: async message => {
    if (message.type === 'owl:warning') return { kind: 'match', matches: [{ field: 'bcc', address: malicious }] };
    decisions.push(message); return { accepted: true };
  } } });
  assert.equal(p.document.querySelector('#warning-title').textContent, 'Are you sure?');
  assert.equal(p.document.querySelector('#warning-description').textContent, 'You’re about to send to this watched address.');
  assert.equal(p.document.querySelector('.warning-symbol').textContent, '🦉');
  assert.equal(p.document.querySelector('.brand'), null);
  assert.equal(p.document.querySelector('.eyebrow'), null);
  assert.equal(p.document.querySelector('[role=dialog]').getAttribute('aria-labelledby'), 'warning-title');
  assert.equal(p.document.querySelector('.warning-notes').nextElementSibling.className, 'warning-actions');
  assert.match(p.document.querySelector('.warning-notes').textContent, /Your decision applies only to this send attempt/);
  assert.equal(p.document.querySelector('#matches').textContent, 'bcc' + malicious);
  assert.equal(p.document.querySelector('#matches img'), null);
  assert.equal(decisions.length, 0);
  assert.equal(p.document.querySelector('#approve').disabled, false);
  await p.click('#approve');
  assert.equal(decisions[0].approved, true);
  assert.equal(p.closed(), 1);
});

test('warning DOM: failure is visibly different and Cancel sends false', async () => {
  const decisions = [];
  const p = await page('warning', { runtime: { sendMessage: async message => {
    if (message.type === 'owl:warning') return { kind: 'error', reason: 'Settings unavailable' };
    decisions.push(message); return { accepted: true };
  } } });
  assert.equal(p.document.querySelector('#warning-title').textContent, 'Recipients could not be verified');
  assert.equal(p.document.querySelector('#approve').textContent, 'Send without verification');
  assert.equal(p.document.querySelector('#verification-error').hidden, false);
  await p.click('#cancel');
  assert.equal(decisions[0].approved, false);
});

test('warning DOM: failed warning load never enables sending', async () => {
  const p = await page('warning', { runtime: { sendMessage: async () => { throw new Error('Unavailable'); } } });
  assert.equal(p.document.querySelector('#approve').disabled, true);
  assert.equal(p.document.querySelector('#warning-title').textContent, 'No approval was given');
});
