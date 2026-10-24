import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAddress, parseWatchlistInput, findMatches } from '../extension/addresses.js';
import { loadWatchlist, saveWatchlist } from '../extension/watchlist.js';

test('full-address normalization preserves aliases and international characters', () => {
  assert.equal(normalizeAddress('  Jane+TAG@Sub.Example.com '), 'jane+tag@sub.example.com');
  assert.equal(normalizeAddress('Zoë@BÜCHER.example'), 'zoë@bücher.example');
  for (const value of [
    'example.com',
    '@example.com',
    '*@example.com',
    'jane?@example.com',
    'Jane <jane@example.com>',
    'a@@b',
    'a b@c',
    '',
    null,
    'a@b\nc@d',
    '.a@b',
    'a..b@c',
    'a@-b',
    'a@b..com',
    'a@b/',
    'a@b#',
  ])
    assert.throws(() => normalizeAddress(value));
});

test('canonically equivalent Unicode addresses match in either normalization form', async () => {
  const nfc = 'zoë@bücher.example';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  const parseMailbox = async (email) => [{ email }];
  for (const [saved, recipient] of [
    [nfc, nfd],
    [nfd, nfc],
  ]) {
    const watched = await loadWatchlist({ get: async () => ({ watchlist: [saved] }) });
    const matches = await findMatches({ to: [recipient] }, new Set(watched), parseMailbox);
    assert.deepEqual(matches, [{ field: 'to', address: nfc }]);
    assert.deepEqual(watched, [nfc]);
  }
  assert.deepEqual(parseWatchlistInput(nfc + '; ' + nfd), { addresses: [nfc], invalid: [] });
  // Lowercasing can introduce a decomposed sequence: normalize the final result.
  assert.equal(normalizeAddress('Ι\u0308\u0301@example.com'), 'ΐ@example.com');
});

test('underscores in the mailbox can be added, saved, loaded, and matched', async () => {
  const address = 'laika_devs@meta.com';
  assert.equal(normalizeAddress(' Laika_Devs@Meta.com '), address);
  assert.deepEqual(parseWatchlistInput(address), { addresses: [address], invalid: [] });
  let stored;
  await saveWatchlist(
    {
      set: async (value) => {
        stored = value;
      },
    },
    [address],
  );
  assert.deepEqual(await loadWatchlist({ get: async () => stored }), [address]);
  const matches = await findMatches(
    { to: ['Laika developers <laika_devs@meta.com>'] },
    new Set([address]),
    async () => [{ email: address }],
  );
  assert.deepEqual(matches, [{ field: 'to', address }]);
  assert.throws(
    () => normalizeAddress('laika@meta_devs.com'),
    'underscore in domain remains invalid',
  );
});

test('watchlist addresses require a domain suffix', async () => {
  for (const address of ['a@email', 'jane@localhost', 'a@email.', 'a@.com']) {
    assert.throws(() => normalizeAddress(address), address);
    assert.deepEqual(parseWatchlistInput(address), { addresses: [], invalid: [address] });
    await assert.rejects(
      saveWatchlist({ set: async () => assert.fail('must not save') }, [address]),
    );
  }
  for (const address of [
    'a@email.com',
    'a@email.co.uk',
    'a@sub.email.de',
    'a@bücher.de',
    'a@xn--bcher-kva.de',
  ]) {
    assert.equal(normalizeAddress(address), address);
  }
});

test('pasting many addresses deduplicates but never silently drops invalid input', () => {
  assert.deepEqual(parseWatchlistInput('A@Example.com; a@example.com\nb@example.com, bad'), {
    addresses: ['a@example.com', 'b@example.com'],
    invalid: ['bad'],
  });
});

const parser = async (value) => [
  { email: value.includes('<') ? value.slice(value.lastIndexOf('<') + 1, -1) : value },
];

test('checks To, Cc and Bcc; native parser receives intact display names', async () => {
  const called = [];
  const result = await findMatches(
    {
      to: ['"Doe, Jane" <Jane@Example.com>'],
      cc: ['jane@example.com', 'jane@example.com'],
      bcc: ['secret@example.com'],
    },
    new Set(['jane@example.com', 'secret@example.com']),
    async (value) => {
      called.push(value);
      return parser(value);
    },
  );
  assert.equal(called[0], '"Doe, Jane" <Jane@Example.com>');
  assert.deepEqual(result, [
    { field: 'to', address: 'jane@example.com' },
    { field: 'cc', address: 'jane@example.com' },
    { field: 'bcc', address: 'secret@example.com' },
  ]);
});

test('does not match substrings, aliases, or domains', async () => {
  assert.deepEqual(
    await findMatches(
      {
        to: [
          'other-jane@example.com',
          'jane+tag@example.com',
          'jane@sub.example.com',
          'j.ane@example.com',
        ],
      },
      new Set(['jane@example.com']),
      parser,
    ),
    [],
  );
});

test('native parser can return multiple concrete mailboxes', async () => {
  const result = await findMatches(
    { to: ['two addresses'] },
    new Set(['a@b.com', 'c@d.com']),
    async () => [{ email: 'a@b.com' }, { email: 'c@d.com' }],
  );
  assert.equal(result.length, 2);
});

test('unresolved lists, object references, and unsupported syntax fail explicitly', async () => {
  for (const value of ['Team <Team>', { type: 'mailingList', nodeId: '123' }, 'not-address'])
    await assert.rejects(findMatches({ to: [value] }, new Set(['a@b']), parser));
  await assert.rejects(findMatches({ to: 'a@b' }, new Set(['a@b']), parser));
  await assert.rejects(findMatches({ to: ['a@b'] }, new Set(['a@b']), async () => []));
});

test('missing watchlist is empty, but malformed settings do not silently become empty', async () => {
  assert.deepEqual(await loadWatchlist({ get: async () => ({}) }), []);
  for (const watchlist of [null, {}, 'a@b', ['bad'], ['*@b']])
    await assert.rejects(loadWatchlist({ get: async () => ({ watchlist }) }));
});

test('only validated, sorted watchlist addresses are saved', async () => {
  let stored;
  await saveWatchlist(
    {
      set: async (value) => {
        stored = value;
      },
    },
    ['Z@b.com', 'a@b.com', 'a@b.com'],
  );
  assert.deepEqual(stored, { watchlist: ['a@b.com', 'z@b.com'] });
  await assert.rejects(saveWatchlist({ set: async () => assert.fail('must not save') }, ['bad']));
});
