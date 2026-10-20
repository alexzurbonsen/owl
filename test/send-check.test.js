import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSendCheck } from '../extension/send-check.js';

function fixture(overrides = {}) {
  const warnings = [], errors = [];
  const check = createSendCheck({ storage: { get: async () => ({ watchlist: ['watched@example.com'] }) }, parseMailbox: async email => [{ email }], ask: async (tab, warning) => { warnings.push({ tab, warning }); return true; }, reportError: error => errors.push(error), ...overrides });
  return { check: details => check({ id: 7 }, details), warnings, errors };
}

test('unwatched recipients send with no popup and no identity needed', async () => {
  const { check, warnings } = fixture();
  assert.deepEqual(await check({ to: ['other@example.com'] }), { cancel: false });
  assert.equal(warnings.length, 0);
});

test('empty watchlist skips recipient parsing', async () => {
  const { check } = fixture({ storage: { get: async () => ({ watchlist: [] }) }, parseMailbox: async () => assert.fail('no parsing') });
  assert.deepEqual(await check({ to: [{ type: 'mailingList' }] }), { cancel: false });
});

test('watched Bcc requires approval on every send attempt', async () => {
  const { check, warnings } = fixture();
  for (let i = 0; i < 2; i++) assert.deepEqual(await check({ bcc: ['watched@example.com'] }), { cancel: false });
  assert.equal(warnings.length, 2);
  assert.deepEqual(warnings[0].warning, { kind: 'match', matches: [{ field: 'bcc', address: 'watched@example.com' }] });
});

test('only an explicit true decision approves sending', async () => {
  for (const decision of [false, undefined, null, 'send', 1]) {
    const { check } = fixture({ ask: async () => decision });
    assert.deepEqual(await check({ to: ['watched@example.com'] }), { cancel: true });
  }
});

test('storage failures require explicit verification-failed override', async () => {
  const { check, warnings, errors } = fixture({ storage: { get: async () => { throw new Error('Storage unavailable'); } } });
  assert.deepEqual(await check({ to: ['watched@example.com'] }), { cancel: false });
  assert.deepEqual(warnings[0].warning, { kind: 'error', reason: 'Storage unavailable' });
  assert.equal(errors.length, 1);
});

test('malformed watchlist and unsupported recipients produce a failure warning', async () => {
  const { check, warnings } = fixture({ storage: { get: async () => ({ watchlist: 'broken' }) } });
  await check({});
  assert.equal(warnings[0].warning.kind, 'error');
  const second = fixture();
  await second.check({ to: [{ type: 'contact' }] });
  assert.equal(second.warnings[0].warning.kind, 'error');
});

test('parser errors do not silently send', async () => {
  let warning;
  const { check } = fixture({ parseMailbox: async () => { throw new Error('Parser failed'); }, ask: async (_tab, value) => { warning = value; return false; } });
  assert.deepEqual(await check({ to: ['watched@example.com'] }), { cancel: true });
  assert.equal(warning.kind, 'error');
});

test('warning failures cancel, without trying another warning or failing open', async () => {
  for (const storage of [{ get: async () => ({ watchlist: ['watched@example.com'] }) }, { get: async () => { throw new Error('broken'); } }]) {
    let asks = 0;
    const { check } = fixture({ storage, ask: async () => { asks++; throw new Error('Popup unavailable'); } });
    assert.deepEqual(await check({ to: ['watched@example.com'] }), { cancel: true });
    assert.equal(asks, 1);
  }
});
