import { test, expect } from '@playwright/test';

async function mockThunderbird(page, options = {}) {
  await page.addInitScript(({ stored = [], warning = null, failRead = false, failWrite = false, failMessage = false }) => {
    let state = stored;
    window.owlTest = { writes: [], decisions: [], requests: [] };
    window.messenger = {
      storage: { local: {
        get: async () => { if (failRead) throw new Error('Storage unavailable'); return { watchlist: state }; },
        set: async value => { if (failWrite) throw new Error('Could not save. Try again.'); state = value.watchlist; window.owlTest.writes.push(value); }
      } },
      runtime: { sendMessage: async message => {
        if (failMessage) throw new Error('Message unavailable');
        if (message.type === 'owl:warning') { window.owlTest.requests.push(message); return warning; }
        window.owlTest.decisions.push(message);
        return { accepted: true };
      } }
    };
  }, options);
}

test('settings add, remove, validate and explicitly save', async ({ page }) => {
  await mockThunderbird(page);
  await page.goto('/options.html');
  await expect(page.getByText('A clear list. A clear head.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.getByLabel('Add email addresses', { exact: true }).fill('Jane@Example.com; staff@company.com\njane@example.com');
  await page.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.locator('#watchlist li')).toHaveCount(2);
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.owlTest.writes)).toEqual([]);
  await page.getByRole('button', { name: 'Save changes' }).click();
  expect(await page.evaluate(() => window.owlTest.writes)).toEqual([{ watchlist: ['jane@example.com', 'staff@company.com'] }]);
  await page.getByRole('button', { name: 'Remove jane@example.com', exact: true }).click();
  await expect(page.locator('#watchlist li')).toHaveCount(1);
  await page.getByLabel('Add email addresses', { exact: true }).fill('valid@example.com, invalid, *@example.com');
  await expect(page.getByRole('button', { name: 'Add to list' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Not full addresses' })).toContainText('invalid');
  await expect(page.locator('#watchlist li')).toHaveCount(1);
});

test('storage failures do not look saved, or silently reset a broken list', async ({ page }) => {
  await mockThunderbird(page, { stored: ['watched@example.com'], failWrite: true });
  await page.goto('/options.html');
  await page.getByRole('button', { name: 'Remove watched@example.com' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Could not save');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
});

test('corrupt settings require explicit repair', async ({ page }) => {
  await mockThunderbird(page, { stored: 'broken' });
  await page.goto('/options.html');
  await expect(page.getByText('Your watchlist could not be loaded.')).toBeVisible();
  await expect(page.getByLabel('Add email addresses', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.owlTest.writes)).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved list' }).click();
  await expect(page.getByLabel('Add email addresses', { exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.owlTest.writes)).toEqual([{ watchlist: [] }]);
});

test('match warning focuses Cancel and records an explicit override', async ({ page }) => {
  await mockThunderbird(page, { warning: { kind: 'match', matches: [{ field: 'to', address: 'all-staff@company.com' }, { field: 'bcc', address: 'sensitive-person@example.com' }] } });
  await page.goto('/warning.html?token=test-token');
  await expect(page.getByRole('heading', { name: 'Are you sure?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel sending' })).toBeFocused();
  await expect(page.locator('#matches li')).toHaveCount(2);
  await expect(page.locator('#matches')).toContainText('bcc');
  await page.getByRole('button', { name: 'Send anyway' }).click();
  expect(await page.evaluate(() => window.owlTest.decisions)).toEqual([{ type: 'owl:decision', token: 'test-token', approved: true }]);
});

test('verification failure has distinct wording and default Cancel', async ({ page }) => {
  await mockThunderbird(page, { warning: { kind: 'error', reason: 'The saved watchlist could not be read.' } });
  await page.goto('/warning.html?token=test-token');
  await expect(page.getByRole('heading', { name: 'Recipients could not be verified' })).toBeVisible();
  await expect(page.getByText('This message has not been verified.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel sending' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send without verification' })).toBeEnabled();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.owlTest.decisions)).toEqual([{ type: 'owl:decision', token: 'test-token', approved: false }]);
});

test('unavailable warning never enables sending', async ({ page }) => {
  await mockThunderbird(page, { failMessage: true });
  await page.goto('/warning.html?token=test-token');
  await expect(page.getByRole('heading', { name: 'No approval was given' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send anyway' })).toBeDisabled();
});

test('untrusted values remain text, not HTML, with no external requests', async ({ page }) => {
  const remote = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8765/')) remote.push(request.url()); });
  const value = '<img src="https://example.invalid/track">';
  await mockThunderbird(page, { warning: { kind: 'match', matches: [{ field: 'to', address: value }] } });
  await page.goto('/warning.html?token=test-token');
  await expect(page.locator('#matches')).toContainText(value);
  await expect(page.locator('#matches img')).toHaveCount(0);
  expect(remote).toEqual([]);
});

for (const colorScheme of ['light', 'dark']) {
  test(`settings and warnings render in ${colorScheme} mode`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await mockThunderbird(page, { stored: ['all-staff@company.com', 'jane@example.com', 'sensitive-person@example.com'], warning: { kind: 'match', matches: [{ field: 'to', address: 'all-staff@company.com' }, { field: 'bcc', address: 'sensitive-person@example.com' }] } });
    await page.goto('/options.html');
    await expect(page.locator('#watchlist li')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath(`settings-${colorScheme}.png`), fullPage: true });
    await page.setViewportSize({ width: 520, height: 440 });
    await page.goto('/warning.html?token=test-token');
    await expect(page.getByRole('button', { name: 'Send anyway' })).toBeEnabled();
    await expect(page.getByRole('dialog', { name: 'Are you sure?' })).toBeVisible();
    await expect(page.locator('.brand')).toHaveCount(0);
    await expect(page.locator('.warning-symbol')).toHaveText('🦉');
    await expect(page.locator('#warning-description')).toHaveText('You’re about to send to these watched addresses.');
    await page.screenshot({ path: testInfo.outputPath(`warning-${colorScheme}.png`), fullPage: true });
    for (const width of [520, 360]) {
      await page.setViewportSize({ width, height: 440 });
      const cancel = await page.locator('#cancel').boundingBox();
      const approve = await page.locator('#approve').boundingBox();
      const notes = await page.locator('.warning-notes').boundingBox();
      expect(Math.abs(cancel.y - approve.y)).toBeLessThan(1);
      expect(approve.x - cancel.x - cancel.width).toBeLessThanOrEqual(10);
      expect(notes.y + notes.height).toBeLessThan(cancel.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
