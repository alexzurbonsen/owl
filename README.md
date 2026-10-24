# Owl

**Are you sure?** A small Thunderbird extension that asks before sending to watched email addresses.

## Behavior

- One global watchlist for all sending accounts. Adding or removing an address saves immediately; typing alone does not. Failed writes leave the saved list unchanged and show an error. Removing the last address requires confirmation.
- Checks **To, Cc, and Bcc**, including display-name forms such as `Jane <jane@example.com>`.
- Matches complete addresses after trimming surrounding whitespace and lowercasing. No domains, wildcards, substring matching, plus-address stripping, or dot normalization.
- Watched recipient → **Cancel sending** or **Send anyway**.
- Failed verification → a distinct warning: **Cancel sending** or **Send without verification**.
- Cancel is focused by default. Closing a warning or pressing Escape cancels.
- If the warning cannot be created or navigated, sending is cancelled. If its page fails to load, no approval is given: close the failed or blank warning window to cancel.
- Each approval applies only to that send attempt. No remembered approvals.
- Uses a persistent Manifest V2 background so Thunderbird does not idle-unload pending warning decisions. Reloading, disabling, or updating the extension still interrupts active warnings; close them and start a new send attempt afterward.
- An intentionally empty watchlist does not interrupt sending.

### Mailing lists and supported addresses

A server-managed list with its own email address can be watched like any other address. Membership is not inspected. Thunderbird address-book references/lists are not expanded: when encountered with a nonempty watchlist, unsupported recipients produce a verification-failed warning rather than being silently considered safe.

The watchlist accepts ordinary unquoted addresses, including international characters, and requires a domain suffix (for example, `jane@example.com`). Single-label domains such as `a@email` are rejected. This checks syntax only, not domain registration or mailbox existence. Previously saved single-label addresses must be removed: a watchlist containing one is reported as invalid rather than silently ignored. Quoted local parts and domain literals are unsupported; recipients using them produce a verification-failed warning. Unicode and punycode spellings are **not** treated as equivalent. There is no alias guessing.

### Limits

This is an accident-prevention tool, not enforceable data-loss prevention. You can override it or disable it. Thunderbird must successfully load and invoke the extension for it to protect a send. Other extensions or server-side forwarding may change the ultimate delivery; Owl checks only the recipients Thunderbird supplies at its send hook.

**Send Later:** verification happens when the message is queued, not again when an already-queued message leaves the Outbox.

Warnings are separate popup windows, not operating-system modal dialogs. The send hook waits for a decision, so the message is paused even though Thunderbird's other windows may remain usable.

## Install

Targets Thunderbird **137 and newer**, using its native mailbox parser (your previously checked 156.0.1 installation meets this requirement). Real Thunderbird integration still requires the manual checks below; the automated tests mock its APIs.

The built package is always `dist/owl.xpi`, with extension ID `owl@owl.local`. Each build replaces that same file; the release version lives inside the manifest, not in the filename. This is a new identity: saved watchlists from builds using the old ID do not transfer. Copy any addresses you want to keep before removing the previous installation, then disable or remove it to avoid duplicate warnings. Re-enter your addresses in Owl; each Add action saves automatically. Future updates using this ID retain the watchlist; the project directory can be renamed independently.

1. Open Thunderbird → **Add-ons and Themes**.
2. Choose the gear menu → **Install Add-on From File…**.
3. Select the XPI and grant the two listed permissions.
4. Open Owl's preferences and use **Add to list** to add full addresses. Additions and removals save automatically; there is no separate Save button.

For development, use Thunderbird's add-on debugging page and **Load Temporary Add-on**, selecting `dist/owl.xpi`. After rebuilding, click **Reload** on that temporary add-on; the file path stays the same. You can also load `extension/manifest.json` directly and reload source changes without packaging. Temporary installations must be reloaded after restarting Thunderbird.

**First test with an address you control.** Add it to the watchlist, send a harmless test message, and verify that cancelling prevents the send before relying on Owl for sensitive mail. If testing against an existing guard add-on, disable the other guard first so its warning does not obscure which extension is responsible.

## Privacy and security

Only these permissions are requested:

| Permission | Purpose                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `compose`  | Read recipient fields and intercept sending. Thunderbird grants broader compose access than this narrow use requires. |
| `storage`  | Save the watchlist in local extension storage.                                                                        |

- No downloads, account enumeration, address-book, clipboard, native-messaging, or host permissions.
- No telemetry, exports/imports, sync storage, remote fonts, or network requests.
- A restrictive content-security policy blocks network connections and nonlocal resources.
- Only the watchlist is persisted. It is **not encrypted by Owl** and may appear in profile backups.
- Email bodies, subjects, sender identities, and attachments are not used, persisted, or logged by Owl. Thunderbird still supplies compose details to the hook under the `compose` permission.
- The warning URL contains a random token, never recipient data. The background page keeps matched addresses only for the pending decision, and releases them afterward.
- Warning-data requests and decisions must come from the matching extension popup window and URL.
- All data-dependent UI uses text nodes, not HTML interpretation.
- Error logs contain a generic diagnostic, not message contents or recipient addresses.

## Development

Uses **Bun 1.3.14** for dependency management and scripts, Node.js **22.13+** for JavaScript tooling and the existing test runner, and Python **3.9+** for packaging. The XPI build needs only Python, not JavaScript dependencies.

```fish
bun install --frozen-lockfile --ignore-scripts
bun run format:check
bun run lint
bun run test
bun run build
```

Use `bun run test`, not `bun test`: the script intentionally runs the Node test runner. `bun.lock` pins development dependencies.

### Formatting and linting

- `bun run format` formats JavaScript, JSON, HTML, CSS, and Markdown with Prettier.
- `bun run format:check` checks formatting without changing files.
- `bun run lint` runs ESLint’s recommended JavaScript rules on the extension, tests, and configuration. Warnings fail the check.
- `bun run lint:fix` applies ESLint’s available automatic fixes.
- `bun run check` runs formatting, linting, unit/DOM tests, the XPI build, and browser UI tests. Browser tests require a Playwright browser and an environment that permits launching it.

The project remains plain JavaScript; no type checker is configured. Python scripts are outside the Prettier/ESLint checks. Generated files, dependencies, the Bun lockfile, and the canonical license text are excluded from formatting. Tooling is development-only and is not shipped in the XPI.

The build includes `extension/` and the root `LICENSE` file, placed at the root of the XPI. Development dependencies and tests are not shipped. Packaging uses sorted files and fixed ZIP timestamps for reproducible output.

### Browser UI tests

The Playwright suite uses mocked Thunderbird APIs and the same CSP as the extension. It covers editing, validation, saving failures, warning decisions, malicious text, keyboard focus, and light/dark layouts. It is **not** a Thunderbird integration test.

```fish
bun run playwright install chromium
bun run test:ui
```

Or select an already installed compatible Chromium browser:

```fish
set -lx OWL_BROWSER_PATH "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
bun run test:ui
```

Screenshots are saved under `test-results/` during the light/dark tests. Browser launch must be allowed by any outer OS sandbox; changing Owl cannot fix a denied browser launch.

### Source map

| Path                      | Responsibility                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `extension/addresses.js`  | Address normalization, paste validation, exact matching using Thunderbird's native mailbox parser. |
| `extension/watchlist.js`  | Validated local watchlist storage.                                                                 |
| `extension/send-check.js` | No-match, match warning, and verification-failed outcomes.                                         |
| `extension/warnings.js`   | Popup lifecycle, sender validation, decisions, cancellation, concurrency.                          |
| `extension/background.js` | Thunderbird API wiring; registers the send hook at module load.                                    |
| `extension/options.*`     | Watchlist settings UI.                                                                             |
| `extension/warning.*`     | Confirmation and error UI.                                                                         |
| `test/`                   | Logic, security, popup-lifecycle, and DOM tests; browser tests in `test/ui/`.                      |

## License

Owl is licensed under the [Apache License, Version 2.0](LICENSE).
