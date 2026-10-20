import { parseWatchlistInput } from './addresses.js';
import { loadWatchlist, saveWatchlist } from './watchlist.js';

const api = messenger;
const input = document.querySelector('#addresses');
const addButton = document.querySelector('#add');
const saveButton = document.querySelector('#save');
const list = document.querySelector('#watchlist');
const status = document.querySelector('#save-status');
const inputError = document.querySelector('#input-error');
let draft = [];
let saved = [];
let loaded = false;
let saving = false;

function dirty() { return JSON.stringify(draft) !== JSON.stringify(saved); }

function updateControls() {
  const parsed = parseWatchlistInput(input.value);
  inputError.hidden = parsed.invalid.length === 0;
  inputError.textContent = parsed.invalid.length ? 'Not full addresses: ' + parsed.invalid.join(', ') + '. Nothing will be added until these are corrected.' : '';
  input.setAttribute('aria-invalid', String(parsed.invalid.length > 0));
  input.disabled = !loaded || saving;
  addButton.disabled = !loaded || saving || parsed.addresses.length === 0 || parsed.invalid.length > 0;
  saveButton.disabled = !loaded || saving || !dirty() || input.value.trim().length > 0;
  for (const button of list.querySelectorAll('button')) button.disabled = saving;
}

function render() {
  list.replaceChildren();
  for (const address of draft) {
    const li = document.createElement('li');
    const avatar = document.createElement('span');
    avatar.className = 'address-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = address[0].toUpperCase();
    const text = document.createElement('span');
    text.className = 'address-text';
    text.textContent = address;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove ' + address);
    remove.addEventListener('click', () => {
      draft = draft.filter(value => value !== address);
      render();
      status.textContent = 'Unsaved changes';
      input.focus();
    });
    li.append(avatar, text, remove);
    list.append(li);
  }
  document.querySelector('#address-count').textContent = String(draft.length);
  document.querySelector('#empty-state').hidden = !loaded || draft.length > 0;
  updateControls();
}

async function load() {
  loaded = false;
  updateControls();
  status.textContent = 'Loading your watchlist…';
  try {
    saved = await loadWatchlist(api.storage.local);
    draft = [...saved];
    loaded = true;
    document.querySelector('#load-error').hidden = true;
    status.textContent = saved.length ? 'All changes saved on this device' : 'No addresses watched yet';
  } catch {
    document.querySelector('#load-error').hidden = false;
    status.textContent = 'Watchlist unavailable';
  }
  render();
}

input.addEventListener('input', () => {
  updateControls();
  status.textContent = input.value.trim() ? 'Add the addresses above before saving' : dirty() ? 'Unsaved changes' : 'All changes saved on this device';
});

document.querySelector('#add-form').addEventListener('submit', event => {
  event.preventDefault();
  if (addButton.disabled) return;
  const { addresses } = parseWatchlistInput(input.value);
  draft = [...new Set([...draft, ...addresses])].sort();
  input.value = '';
  render();
  status.textContent = dirty() ? 'Unsaved changes' : 'These addresses are already in your list';
  input.focus();
});

saveButton.addEventListener('click', async () => {
  if (saveButton.disabled) return;
  if (draft.length === 0 && !window.confirm('Save an empty watchlist? Parrot will no longer warn about matched addresses.')) return;
  saving = true;
  updateControls();
  status.textContent = 'Saving…';
  try {
    // Do not silently overwrite edits saved by another settings tab.
    const current = await loadWatchlist(api.storage.local);
    if (JSON.stringify(current) !== JSON.stringify(saved)) throw new Error('Your watchlist changed in another settings tab. Reload this page before saving.');
    saved = await saveWatchlist(api.storage.local, draft);
    status.textContent = 'All changes saved on this device';
  } catch (error) {
    status.textContent = error.message || 'Could not save. Your changes are still here; please try again.';
  } finally {
    saving = false;
    updateControls();
  }
});

document.querySelector('#retry').addEventListener('click', load);
document.querySelector('#reset').addEventListener('click', async () => {
  if (!window.confirm('Clear the saved watchlist? This removes every watched address. Parrot will not warn about matched addresses until you add and save new ones.')) return;
  try {
    await saveWatchlist(api.storage.local, []);
    await load();
  } catch {
    status.textContent = 'Could not clear the saved watchlist. Nothing has been repaired.';
  }
});

window.addEventListener('beforeunload', event => {
  if (dirty() || input.value.trim()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

load();
