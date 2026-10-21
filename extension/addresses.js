// Exact addresses, not patterns. Deliberately no alias or domain normalization.
export function normalizeAddress(value) {
  if (typeof value !== 'string') throw new Error('Enter a full email address.');
  const address = value.trim().toLowerCase();
  // Accept ordinary and international addresses, including single-label domains.
  // Quoted local parts and domain literals are outside Owl's supported syntax.
  if (address.length > 254 || !/^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+$/u.test(address)) {
    throw new Error('Use a full address, such as jane@example.com (no display names or patterns).');
  }
  if (address.includes('*') || address.includes('?')) throw new Error('Patterns are not supported. Enter a full email address.');
  const [local, domain] = address.split('@');
  const labels = domain.split('.');
  if (local.length > 64 || !/^[\p{L}\p{N}\p{M}!#$%&'+/=`{|}~^.-]+$/u.test(local) ||
      local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      labels.some(label => label.length > 63 || !/^[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}-]*[\p{L}\p{N}\p{M}])?$/u.test(label))) {
    throw new Error('Enter a complete email address with a valid mailbox and domain.');
  }
  return address;
}

export function parseWatchlistInput(text) {
  const addresses = [];
  const invalid = [];
  const seen = new Set();
  for (const value of text.split(/[\s,;]+/u).filter(Boolean)) {
    try {
      const address = normalizeAddress(value);
      if (!seen.has(address)) addresses.push(address);
      seen.add(address);
    } catch {
      invalid.push(value);
    }
  }
  return { addresses, invalid };
}

export async function findMatches(details, watched, parseMailbox) {
  const matches = [];
  const seen = new Set();
  for (const field of ['to', 'cc', 'bcc']) {
    const recipients = details[field] ?? [];
    if (!Array.isArray(recipients)) throw new Error('Recipient data could not be read.');
    for (const recipient of recipients) {
      if (typeof recipient !== 'string') throw new Error('A recipient is an unsupported address-book reference. Mailing lists are not expanded.');
      const mailboxes = await parseMailbox(recipient);
      if (!Array.isArray(mailboxes) || mailboxes.length === 0) throw new Error('A recipient could not be parsed as an email address.');
      for (const mailbox of mailboxes) {
        let address;
        try { address = normalizeAddress(mailbox.email); }
        catch { throw new Error('A recipient is not a supported literal email address. Mailing lists are not expanded.'); }
        const key = field + ':' + address;
        if (watched.has(address) && !seen.has(key)) {
          matches.push({ field, address });
          seen.add(key);
        }
      }
    }
  }
  return matches;
}
