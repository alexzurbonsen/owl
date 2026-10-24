import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);

test('rebuilding replaces owl.xpi and includes the exact root license', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owl-build-'));
  try {
    for (const path of ['scripts/build.py', 'extension', 'package.json', 'LICENSE']) {
      await cp(new URL('../' + path, import.meta.url), join(root, path), { recursive: true });
    }
    const build = () => exec('python3', ['scripts/build.py'], { cwd: root });
    assert.equal((await build()).stdout.trim(), 'dist/owl.xpi');
    const first = await readFile(join(root, 'dist/owl.xpi'));
    for (const path of ['extension/manifest.json', 'package.json']) {
      const file = join(root, path);
      const manifest = JSON.parse(await readFile(file, 'utf8'));
      manifest.version = '99.0.0';
      await writeFile(file, JSON.stringify(manifest));
    }
    assert.equal((await build()).stdout.trim(), 'dist/owl.xpi');
    assert.deepEqual(await readdir(join(root, 'dist')), ['owl.xpi']);
    assert.notDeepEqual(await readFile(join(root, 'dist/owl.xpi')), first);
    const packagedVersion = await exec(
      'python3',
      [
        '-c',
        'import json,zipfile; from pathlib import Path; archive=zipfile.ZipFile("dist/owl.xpi"); assert archive.read("LICENSE")==Path("LICENSE").read_bytes(); print(json.loads(archive.read("manifest.json"))["version"])',
      ],
      { cwd: root },
    );
    assert.equal(packagedVersion.stdout.trim(), '99.0.0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
