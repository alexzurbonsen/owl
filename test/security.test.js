import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../extension/', import.meta.url);
test('manifest has only compose and local-storage permission; network is blocked', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  assert.deepEqual(manifest.permissions, ['compose', 'storage']);
  assert.equal(typeof manifest.content_security_policy, 'string');
  assert.match(manifest.content_security_policy, /connect-src 'none'/);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('pending send decisions use an explicitly persistent Manifest V2 background', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  assert.equal(manifest.manifest_version, 2);
  assert.equal(manifest.background.persistent, true);
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.background.scripts, ['background.js']);
});

test('shipped scripts have no HTML injection, telemetry, remote code, or sync storage', async () => {
  for (const file of await readdir(root)) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|storage\.sync|navigator\.clipboard|fetch\(|XMLHttpRequest|WebSocket|https?:\/\//, file);
  }
});
