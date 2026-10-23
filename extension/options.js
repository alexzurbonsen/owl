import { parseWatchlistInput } from './addresses.js';
import { loadWatchlist, saveWatchlist } from './watchlist.js';

const api = messenger;
const input = document.querySelector('#addresses');
const addButton = document.querySelector('#add');
const list = document.querySelector('#watchlist');
const status = document.querySelector('#save-status');
const saveError = document.querySelector('#save-error');
const inputError = document.querySelector('#input-error');
let addresses = [];
let loaded = false;
let saving = false;

function updateControls() {
  const parsed = parseWatchlistInput(input.value);
  inputError.hidden = parsed.invalid.length === 0;
  inputError.textContent = parsed.invalid.length ? 'Not full addresses: ' + parsed.invalid.join(', ') + '. Nothing will be added until these are corrected.' : '';
  input.setAttribute('aria-invalid', String(parsed.invalid.length > 0));
  input.disabled = !loaded || saving;
  addButton.disabled = !loaded || saving || parsed.addresses.length === 0 || parsed.invalid.length > 0;
  for (const button of list.querySelectorAll('button')) button.disabled = !loaded || saving;
  document.querySelector('#retry').disabled = saving;
  document.querySelector('#reset').disabled = saving;
}

function render() {
  list.replaceChildren();
  for (const address of addresses) {
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
    remove.addEventListener('click', async () => {
      if (!loaded || saving) return;
      if (addresses.length === 1 && !window.confirm('Remove the last watched address? Owl will no longer warn about matched addresses.')) return;
      if (await persist(addresses.filter(value => value !== address))) input.focus();
    });
    li.append(avatar, text, remove);
    list.append(li);
  }
  document.querySelector('#address-count').textContent = String(addresses.length);
  document.querySelector('#empty-state').hidden = !loaded || addresses.length > 0;
  updateControls();
}

async function load() {
  loaded = false;
  saveError.hidden = true;
  updateControls();
  status.textContent = 'Loading your watchlist…';
  try {
    addresses = await loadWatchlist(api.storage.local);
    loaded = true;
    document.querySelector('#load-error').hidden = true;
    status.textContent = addresses.length ? 'Saved on this device' : 'No addresses watched yet';
  } catch {
    document.querySelector('#load-error').hidden = false;
    status.textContent = 'Watchlist unavailable';
  }
  render();
}

async function persist(next) {
  saving = true;
  saveError.hidden = true;
  updateControls();
  status.textContent = 'Saving…';
  try {
    // Do not silently overwrite edits saved by another settings tab.
    const current = await loadWatchlist(api.storage.local);
    if (JSON.stringify(current) !== JSON.stringify(addresses)) {
      throw new Error('Your watchlist changed in another settings tab. Reload this page before making changes.');
    }
    addresses = await saveWatchlist(api.storage.local, next);
    status.textContent = 'Saved on this device';
    render();
    return true;
  } catch (error) {
    status.textContent = 'Changes not saved';
    saveError.textContent = error.message || 'Could not save. Try the action again.';
    saveError.hidden = false;
    return false;
  } finally {
    saving = false;
    updateControls();
  }
}

input.addEventListener('input', updateControls);

document.querySelector('#add-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (addButton.disabled) return;
  const parsed = parseWatchlistInput(input.value);
  const next = [...new Set([...addresses, ...parsed.addresses])].sort();
  if (JSON.stringify(next) === JSON.stringify(addresses)) {
    status.textContent = 'These addresses are already in your list';
  } else if (!(await persist(next))) {
    return;
  }
  input.value = '';
  updateControls();
  input.focus();
});

document.querySelector('#retry').addEventListener('click', load);
document.querySelector('#reset').addEventListener('click', async () => {
  if (saving || !window.confirm('Clear the saved watchlist? This removes every watched address. Owl will not warn about matched addresses until you add new ones.')) return;
  saving = true;
  updateControls();
  try {
    await saveWatchlist(api.storage.local, []);
    await load();
  } catch {
    status.textContent = 'Could not clear the saved watchlist. Nothing has been repaired.';
  } finally {
    saving = false;
    updateControls();
  }
});

window.addEventListener('beforeunload', event => {
  if (saving || input.value.trim()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

load();
