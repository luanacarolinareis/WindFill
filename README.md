# WindFill

Author: Luana Carolina Reis

WindFill is an offline Chrome extension for autofilling `username` and `password` on internal login pages reached by IP address, hostname, or URL pattern. It is designed for restricted environments where controller pages are accessed directly, connectivity may be limited, and a lightweight local-only workflow is preferred.

Repository status: public and source-available under `PolyForm Noncommercial 1.0.0`. It is not open source.

## Table of contents

- [Preview](#preview)
- [Overview](#overview)
- [Security and privacy](#security-and-privacy)
- [Permission model](#permission-model)
- [Repository review notes](#repository-review-notes)
- [Installation](#installation)
- [Using WindFill](#using-windfill)
- [Pattern examples](#pattern-examples)
- [JSON import and export](#json-import-and-export)
- [Advanced selectors](#advanced-selectors)
- [Test pages](#test-pages)
- [Troubleshooting](#troubleshooting)
- [Security policy](#security-policy)
- [License and trademarks](#license-and-trademarks)

## Preview

### Options page

<img src="config-preview.png" alt="WindFill options page preview" width="760">

### Popup

<img src="popup-preview.png" alt="WindFill popup preview" width="360">

## Overview

WindFill currently provides:

- Offline credential autofill after installation.
- Local profile storage in `chrome.storage.local`.
- Matching by exact host, wildcard host, exact URL, or wildcard URL.
- Multiple patterns per profile.
- Optional auto-submit after fields are filled.
- A popup with matching profiles, exact matched patterns, last-used highlighting, manual fill, and page diagnostics.
- An options page with search, simple/detailed views, autosave, sorting, notes, last-modified timestamps, and incomplete-profile indicators.
- Duplicate and drag-reorder profile management.
- Global best-match priority rules with draggable ranking.
- Advanced-selector testing against currently open matching pages.
- A built-in troubleshooting page.
- Encrypted JSON export/import for profile transfer between machines, with legacy plaintext JSON import support.
- A right-click context menu action to trigger fill from the page.
- Local test pages for validation without real controller systems.

## Security and privacy

The statements below describe the current implementation in this repository.

### Current security characteristics

- WindFill is designed to work fully offline after installation.
- No external API, backend, telemetry, analytics, or remote service is used by the extension.
- No `fetch` or `XMLHttpRequest` calls are implemented in the extension code.
- The extension ships as plain HTML, CSS, and JavaScript files stored in this repository.
- No CDN assets, remote scripts, or third-party runtime SDKs are used.

### Data handling

- Profiles and credentials are stored locally in `chrome.storage.local`.
- Profile metadata such as notes, timestamps, sort preferences, view preferences, and best-match rules are also stored locally.
- WindFill can export and import encrypted JSON files protected by a user-supplied passphrase.
- Legacy plaintext JSON profile files are still accepted on import for backwards compatibility.
- WindFill does not add its own encryption layer to credentials already stored in `chrome.storage.local`.
- Protection of local data therefore depends on the security of the Windows account, Chrome profile, disk, and local machine controls.

### Recommended operational controls

- Use a dedicated Chrome profile for operational access.
- Prefer encrypted WindFill exports over legacy plaintext JSON files.
- Treat exported JSON files and passphrases as sensitive secrets.
- Limit access to machines where WindFill profiles are configured.
- Prefer least-privilege controller accounts where possible.
- Review and reload the unpacked extension only from trusted local source.

### Important limitation

WindFill reduces repetitive login work, but it is not a password vault, enterprise secret manager, or endpoint hardening product.

## Permission model

WindFill currently requests the following Chrome permissions:

| Permission | Why it is used |
| --- | --- |
| `storage` | Save profiles, credentials, notes, timestamps, theme/view/autosave preferences, sort settings, and best-match settings locally. |
| `tabs` | Read the active tab URL and support popup diagnostics/manual fill actions. |
| `scripting` | Reinject the local content scripts when a page was already open before extension reload. |
| `contextMenus` | Provide the right-click action `Fill login with WindFill`. |
| `host_permissions: <all_urls>` | Support direct-IP, internal hostname, HTTP, and HTTPS login pages across different controller environments. |
| `content_scripts: <all_urls>` | Detect matching pages and perform local autofill on supported login pages. |

Notes for reviewers:

- `"<all_urls>"` is used because target systems may vary by IP, hostname, path, and protocol.
- In a controlled deployment with a fixed target estate, the manifest can be narrowed in a private review build before installation.

## Repository review notes

This repository is intentionally easy to inspect:

- Runtime code is committed directly in source form.
- No build tool is required to understand extension behavior.
- No package manager install is required for the extension itself.
- The release ZIP is created by archiving repository files, not by bundling hidden generated code.

## Installation

### Clone the repository

```powershell
git clone https://github.com/luanacarolinareis/WindFill.git
cd WindFill
```

### Load unpacked

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the repository root.
5. Open the extension options page and configure the required profiles.

### Package as CRX

If the target environment blocks `Load unpacked`, package the same source as a `.crx`:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Pack extension`.
4. Choose the repository root as the extension root.
5. Chrome will generate a `.crx` and a private key file.

## Using WindFill

### Popup

The popup is intended for fast checks and manual actions on the current tab.

- Shows the current page URL.
- Shows matching profiles for the current page.
- Shows the exact saved pattern that matched the current page.
- Highlights the most recently used profile when one is known.
- Includes `Fill best match` for manual execution.
- Includes a collapsible `Page diagnostics` section.
- Includes quick access to `Options` and built-in `Troubleshooting`.
- Includes a theme toggle.

### Options page

The options page is the main configuration surface.

- Create, duplicate, and remove any number of profiles.
- Add multiple match patterns per profile.
- Search by controller name, pattern, username, or selector text.
- Add free-form notes to each profile.
- Review the `Last modified` timestamp for each profile.
- Switch between `Simple` and `Detailed` profile views.
- Enable or disable `Autosave`.
- Reorder profiles by drag and drop when `Order by` is set to `Manual`.
- Sort profiles by `Name` or `Last modified`, in ascending or descending order.
- Configure global `Best match priority` rules and drag them into the preferred ranking order.
- See incomplete-profile indicators when a pattern, username, or password is missing.
- Test advanced selectors against an already open matching page.
- Use the save button for an immediate manual save.
- Use `Reset` to clear all profiles and restore the default UI settings.

### Right-click action

WindFill also adds a context menu action:

1. Right-click on a page or editable field.
2. Choose `Fill login with WindFill`.

This uses the matching saved profile for that page and attempts to fill the visible login form directly from the DOM.

### Best match priority and ordering

WindFill applies one global ranking policy whenever more than one enabled profile matches the same page.

- `Pattern specificity` prefers more exact matches over broader wildcard matches.
- `Last modified` can prefer either the most recently updated profiles or the oldest ones.
- `Saved login data` can prefer complete profiles or profiles that still have missing credentials.

In the options page, these rules can be dragged into the preferred ranking order under `Best match priority`. The same policy is then used for:

- automatic page autofill
- `Fill best match` in the popup
- the order of `Matching profiles` shown in the popup

Profile ordering in the options page is separate from match ranking. `Order by` only changes how the configuration list is displayed.

## Pattern examples

- Exact IP host: `192.168.1.10`
- Wildcard IP host: `10.0.0.*`
- Full URL pattern: `http://192.168.1.10/*`
- HTTPS URL pattern: `https://controller.local/*`
- Specific controller host example: `10.*.*.130`
- Short wildcard example: `10.*.*.13*`

In the options UI, each pattern is added on its own line. In stored JSON, `matchPattern` may still contain multiple patterns separated by commas or new lines.

## JSON import and export

The options page can export the current profile list to JSON and import it later on the same machine or another machine.

### Export

1. Open the options page.
2. Make sure the desired profiles are already saved.
3. Click `Export JSON`.
4. Enter and confirm a passphrase for the export file.
5. The browser downloads `windfill-profiles.encrypted.json`.

Typical use cases:

- backups before editing
- profile transfer between systems
- maintaining a master offline controller list

### Import

1. Open the options page.
2. Click `Import JSON`.
3. Select a previously exported `.json` file.
4. If the file is encrypted, enter the passphrase used during export.
5. WindFill loads the profiles and saves them locally.

Important notes:

- Import replaces the current in-memory list shown in the options page.
- Imported profiles are then saved to `chrome.storage.local`.
- Encrypted WindFill exports are the default format.
- Legacy plaintext JSON arrays are still supported on import.
- Profile metadata such as `createdAt`, `lastModifiedAt`, `notes`, and matching settings travels with the exported profiles.
- Invalid JSON or unsupported payloads are rejected.

### Encrypted export example

```json
{
  "format": "windfill-encrypted-export",
  "version": 1,
  "cipher": "AES-GCM-256",
  "kdf": "PBKDF2-SHA-256",
  "iterations": 250000,
  "salt": "<base64>",
  "iv": "<base64>",
  "ciphertext": "<base64>"
}
```

### Legacy plaintext example

```json
[
  {
    "id": "profile-example-1",
    "name": "Main controller",
    "createdAt": "2026-04-07T00:00:00.000Z",
    "lastModifiedAt": "2026-04-07T00:15:30.000Z",
    "matchPattern": "http://192.168.1.10/*",
    "username": "admin",
    "password": "secret",
    "notes": "Primary maintenance access",
    "usernameSelector": "",
    "passwordSelector": "",
    "submitSelector": "",
    "autoSubmit": false,
    "enabled": true,
    "overwriteExisting": true
  }
]
```

## Advanced selectors

Most simple login pages should work without selectors. If a page uses unusual field names or structure, configure:

- `Username selector`
- `Password selector`
- `Submit selector`

Examples:

- `#username`
- `input[name="username"]`
- `#device-key`
- `input[type="password"]`
- `button[type="submit"]`

### Finding selectors in Chrome

1. Open the target login page.
2. Right-click the field and choose `Inspect`.
3. Look for stable attributes such as `id`, `name`, `type`, or `placeholder`.
4. Prefer short, stable selectors over long structural selectors.

Good:

- `#user`
- `input[name="operator-code"]`
- `button[type="submit"]`

Avoid:

- `div > div > form > input:nth-child(2)`
- `.panel .row .field input`

## Test pages

Local test pages are included in [test-pages](test-pages).

Start a local server from the repository root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

- `http://127.0.0.1:8765/test-pages/basic-login.html`
- `http://127.0.0.1:8765/test-pages/selector-login.html`

For test-page-specific instructions, see [test-pages/README.md](test-pages/README.md).

## Troubleshooting

For common issues and quick fixes, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Security policy

For deployment guidance, data-handling notes, and vulnerability reporting expectations, see [SECURITY.md](SECURITY.md).

## License and trademarks

- Source code license: [PolyForm Noncommercial 1.0.0](LICENSE.md)
- Required notices: [NOTICE](NOTICE)
- Branding and naming rules: [TRADEMARKS.md](TRADEMARKS.md)

Summary:

- the code is publicly visible on GitHub
- noncommercial use is governed by PolyForm Noncommercial 1.0.0
- commercial or business use requires separate written permission
- `WindFill`, its logo, icons, and branding are not licensed with the source code
