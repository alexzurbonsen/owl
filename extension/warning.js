const token = new URLSearchParams(location.search).get('token');
const cancel = document.querySelector('#cancel');
const approve = document.querySelector('#approve');
const description = document.querySelector('#warning-description');
let deciding = false;
let active = false;

function unavailable() {
  active = false;
  approve.disabled = true;
  cancel.disabled = false;
  document.querySelector('#warning-title').textContent = 'No approval was given';
  description.textContent = 'Parrot could not complete this warning. Close this window to cancel sending, then try again.';
  cancel.textContent = 'Close and cancel';
}

async function decide(approved) {
  if (deciding) return;
  if (!active) { window.close(); return; }
  deciding = true;
  cancel.disabled = true;
  approve.disabled = true;
  try {
    const response = await messenger.runtime.sendMessage({ type: 'parrot:decision', token, approved });
    if (response?.accepted !== true) throw new Error('No acknowledgement.');
    window.close();
  } catch {
    deciding = false;
    unavailable();
  }
}

cancel.addEventListener('click', () => decide(false));
approve.addEventListener('click', () => decide(true));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); decide(false); }
});

async function initialize() {
  try {
    if (!token) throw new Error('Missing warning token.');
    const warning = await messenger.runtime.sendMessage({ type: 'parrot:warning', token });
    if (warning?.kind === 'match' && Array.isArray(warning.matches) && warning.matches.length > 0) {
      document.querySelector('#warning-title').textContent = 'The right people?';
      const count = warning.matches.length;
      description.textContent = 'This message includes ' + count + ' watched ' + (count === 1 ? 'recipient' : 'recipients') + '. Check that you intend to include ' + (count === 1 ? 'this address.' : 'these addresses.');
      const list = document.querySelector('#matches');
      for (const match of warning.matches) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'recipient-field';
        label.textContent = match.field;
        const address = document.createElement('span');
        address.className = 'address-text';
        address.textContent = match.address;
        li.append(label, address);
        list.append(li);
      }
      list.hidden = false;
    } else if (warning?.kind === 'error') {
      document.body.classList.add('verification-failed');
      document.querySelector('#warning-symbol').textContent = '!';
      document.querySelector('#warning-eyebrow').textContent = 'CHECK INTERRUPTED';
      document.querySelector('#warning-title').textContent = 'Recipients could not be verified';
      description.textContent = 'The recipient check did not finish. This is not a successful check or a matched-address confirmation.';
      document.querySelector('#error-reason').textContent = warning.reason;
      document.querySelector('#verification-error').hidden = false;
      approve.textContent = 'Send without verification';
    } else {
      throw new Error('Invalid warning data.');
    }
    document.title = 'Parrot · ' + document.querySelector('#warning-title').textContent;
    active = true;
    approve.disabled = false;
    cancel.focus();
  } catch {
    unavailable();
    cancel.focus();
  }
}

initialize();
