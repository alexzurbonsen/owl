import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, parseWatchlistInput, findMatches } from '../extension/addresses.js';
import { loadWatchlist, saveWatchlist } from '../extension/watchlist.js';

test('full-address normalization preserves aliases and requires no public domain', () => {
  assert.equal(normalizeAddress('  Jane+TAG@Sub.Example.com '), 'jane+tag@sub.example.com');
  assert.equal(normalizeAddress('jane@localhost'), 'jane@localhost');
  assert.equal(normalizeAddress('Zoë@BÜCHER.example'), 'zoë@bücher.example');
  for (const value of ['example.com', '@example.com', '*@example.com', 'jane?@example.com', 'Jane <jane@example.com>', 'a@@b', 'a b@c', '', null, 'a@b\nc@d', '.a@b', 'a..b@c', 'a@-b', 'a@b..com', 'a@b/', 'a@b#']) assert.throws(() => normalizeAddress(value));
});

test('pasting many addresses deduplicates but never silently drops invalid input', () => {
  assert.deepEqual(parseWatchlistInput('A@Example.com; a@example.com\nb@example.com, bad'), { addresses: ['a@example.com', 'b@example.com'], invalid: ['bad'] });
});

const parser = async value => [{ email: value.includes('<') ? value.slice(value.lastIndexOf('<') + 1, -1) : value }];

test('checks To, Cc and Bcc; native parser receives intact display names', async () => {
  const called = [];
  const result = await findMatches({ to: ['"Doe, Jane" <Jane@Example.com>'], cc: ['jane@example.com', 'jane@example.com'], bcc: ['secret@example.com'] }, new Set(['jane@example.com', 'secret@example.com']), async value => { called.push(value); return parser(value); });
  assert.equal(called[0], '"Doe, Jane" <Jane@Example.com>');
  assert.deepEqual(result, [{ field: 'to', address: 'jane@example.com' }, { field: 'cc', address: 'jane@example.com' }, { field: 'bcc', address: 'secret@example.com' }]);
});

test('does not match substrings, aliases, or domains', async () => {
  assert.deepEqual(await findMatches({ to: ['other-jane@example.com', 'jane+tag@example.com', 'jane@sub.example.com', 'j.ane@example.com'] }, new Set(['jane@example.com']), parser), []);
});

test('native parser can return multiple concrete mailboxes', async () => {
  const result = await findMatches({ to: ['two addresses'] }, new Set(['a@b', 'c@d']), async () => [{ email: 'a@b' }, { email: 'c@d' }]);
  assert.equal(result.length, 2);
});

test('unresolved lists, object references, and unsupported syntax fail explicitly', async () => {
  for (const value of ['Team <Team>', { type: 'mailingList', nodeId: '123' }, 'not-address']) await assert.rejects(findMatches({ to: [value] }, new Set(['a@b']), parser));
  await assert.rejects(findMatches({ to: 'a@b' }, new Set(['a@b']), parser));
  await assert.rejects(findMatches({ to: ['a@b'] }, new Set(['a@b']), async () => []));
});

test('missing watchlist is empty, but malformed settings do not silently become empty', async () => {
  assert.deepEqual(await loadWatchlist({ get: async () => ({}) }), []);
  for (const watchlist of [null, {}, 'a@b', ['bad'], ['*@b']]) await assert.rejects(loadWatchlist({ get: async () => ({ watchlist }) }));
});

test('only validated, sorted watchlist addresses are saved', async () => {
  let stored;
  await saveWatchlist({ set: async value => { stored = value; } }, ['Z@b', 'a@b', 'a@b']);
  assert.deepEqual(stored, { watchlist: ['a@b', 'z@b'] });
  await assert.rejects(saveWatchlist({ set: async () => assert.fail('must not save') }, ['bad']));
});
