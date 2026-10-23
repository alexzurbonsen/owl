import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('light and dark theme text meets WCAG AA contrast against its surfaces', async () => {
  const css = await readFile(new URL('../extension/ui.css', import.meta.url), 'utf8');
  const themes = [...css.matchAll(/:root \{([^}]+)\}/g)];
  assert.equal(themes.length, 2);
  for (const [index, theme] of themes.entries()) {
    const colors = Object.fromEntries([...theme[1].matchAll(/--([a-z-]+): (#[0-9a-f]{3,8});/g)].map(([, name, hex]) => [name, hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex]));
    for (const [foreground, background] of [['ink', 'surface'], ['muted', 'surface'], ['muted', 'bg'], ['accent', 'soft'], ['on-accent', 'accent'], ['on-accent', 'accent-hover'], ['error-ink', 'error-bg']]) {
      assert(contrast(colors[foreground], colors[background]) >= 4.5, 'Theme ' + index + ': ' + foreground + ' on ' + background);
    }
  }
});

test('Owl uses its own extension ID and ships the emoji icon', async () => {
  const root = new URL('../extension/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.name, 'Owl');
  assert.equal(manifest.browser_specific_settings.gecko.id, 'owl@owl.local');
  for (const file of Object.values(manifest.icons)) {
    assert.match(await readFile(new URL(file, root), 'utf8'), /🦉/u);
  }
});
