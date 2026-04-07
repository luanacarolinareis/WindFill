# WindFill

Made by Luana Carolina Reis ♥

WindFill is an offline Chrome extension to autofill `username` and `password` on login pages reached by IP or URL pattern.

This repository is public, but it is not open source. The code is source-available under `PolyForm Noncommercial 1.0.0`, and commercial use requires separate written permission.

## Table of contents

- [Preview](#preview)
- [License and trademarks](#license-and-trademarks)
- [What it does](#what-it-does)
- [Clone the repository](#clone-the-repository)
- [Install offline](#install-offline)
- [Popup and quick actions](#popup-and-quick-actions)
- [Options page features](#options-page-features)
- [Right-click fill](#right-click-fill)
- [Pattern examples](#pattern-examples)
- [Troubleshooting](#troubleshooting)
- [Import and export JSON](#import-and-export-json)
- [Export](#export)
- [Import](#import)
- [JSON format](#json-format)
- [Notes for manual editing](#notes-for-manual-editing)
- [Advanced selectors](#advanced-selectors)
- [How to find the right selectors](#how-to-find-the-right-selectors)
- [Quick method in Chrome](#quick-method-in-chrome)
- [Best selector choices](#best-selector-choices)
- [Avoid brittle selectors](#avoid-brittle-selectors)
- [Using "Copy selector"](#using-copy-selector)
- [What to look for in the HTML](#what-to-look-for-in-the-html)
- [Practical workflow](#practical-workflow)
- [Tip](#tip)

## Preview

### Options page

<img src="config-preview.png" alt="WindFill options page preview" width="760">

### Popup

<img src="popup-preview.png" alt="WindFill popup preview" width="360">

## License and trademarks

- Source code license: `PolyForm Noncommercial 1.0.0`
- Required notices: [NOTICE](NOTICE)
- Branding and naming rules: [TRADEMARKS.md](TRADEMARKS.md)

This means:

- the code stays publicly visible on GitHub
- noncommercial use is allowed under the PolyForm terms
- commercial use, resale, internal business deployment, or commercial derivative work requires separate written permission
- the `WindFill` name, logo, icons, and branding are not licensed with the code

See [LICENSE](LICENSE), [NOTICE](NOTICE), and [TRADEMARKS.md](TRADEMARKS.md).

## What it does

- Works fully offline after installation.
- Stores profiles locally in `chrome.storage.local`.
- Matches pages by IP, hostname, or wildcard URL pattern.
- Autofills simple login forms with `username` and `password`.
- Can optionally auto-submit after filling.
- Includes an options page to manage any number of profiles.
- Supports multiple patterns per profile with add/remove controls in the UI.
- Includes a popup with matching profiles, manual fill, and page diagnostics.
- Includes search, simple/detailed view, quick add, and built-in troubleshooting.
- Includes autosave, manual save, and a reset action that restores default settings.
- Includes a right-click context menu action to trigger fill from the page.
- Includes JSON import/export so profiles can be moved between servers.
- Includes a light and dark theme switch for the extension UI.

## Clone the repository

```powershell
git clone https://github.com/luanacarolinareis/ControllerLoginAutofill.git
cd ControllerLoginAutofill
```

## Install offline

Main offline install method:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the root folder of the repository.
5. Open the extension options and add as many profiles as needed.

If the target machine blocks `Load unpacked`, you can package the extension as a `.crx` from the same screen:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Pack extension`.
4. Choose the root folder of the repository as the extension root.
5. Chrome will generate a `.crx` file and a private key file.

## Popup and quick actions

The popup is designed for fast checks and manual triggering on the current page.

- Shows the current page URL.
- Shows matching profiles for the current tab.
- Includes `Fill best match` for one-click manual fill.
- Includes a collapsible `Page diagnostics` section for match and script status.
- Includes quick buttons for `Options` and built-in `Troubleshooting`.
- Includes a theme toggle directly in the popup.

## Options page features

The options page now includes several quality-of-life features beyond basic profile editing.

- `Search` filters controllers by name, pattern, username, and selector fields.
- `View` switches between `Simple` and `Detailed` layouts.
- `Autosave` can be enabled or disabled.
- The save button can still be used manually as a `save now` action.
- `Reset` recreates the starter list and restores default settings:
  - dark theme
  - autosave on
  - detailed view
- Each profile can contain multiple match patterns using `+ Add pattern`.
- A quick-add card appears at the end of the grid to create a new controller faster.

## Right-click fill

WindFill also adds a context menu item in Chrome:

- Right-click on a page or editable field
- Choose `Fill login with WindFill`

This uses the matching saved profile for that page and tries to fill the login form directly from the DOM.

## Pattern examples

- Exact IP: `192.168.1.10`
- Wildcard IP range: `10.0.0.*`
- Full URL pattern: `http://192.168.1.10/*`
- HTTPS URL pattern: `https://controller.local/*`
- Specific controller host examples: `10.*.*.130`
- Short wildcard example: `10.*.*.13*`

In the options UI, each profile can contain multiple patterns using one line per entry.

The stored `matchPattern` value still supports multiple patterns separated by comma or new line when imported from JSON or edited manually.

## Troubleshooting

For common errors and fixes, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Import and export JSON

The options page can export the current profile list to a JSON file and import it again later on the same machine or another machine.

### Export

1. Open the extension options page.
2. Make sure the profiles you want are already saved.
3. Click `Export JSON`.
4. The browser will download a file named `controller-autofill-profiles.json`.

Use export when you want to:

- Back up the current profiles before changing them
- Copy profiles to another server or Chrome profile
- Keep a master list of IPs, usernames, selectors, and settings

### Import

1. Open the extension options page.
2. Click `Import JSON`.
3. Select a previously exported `.json` file.
4. The extension will load the profiles and save them locally automatically.

Important:

- Import replaces the current in-memory list shown in the options page with the contents of the JSON file.
- After a successful import, the imported profiles are saved to `chrome.storage.local`.
- If the JSON file is invalid or not an array of profiles, the import is rejected.

### JSON format

The file contains an array of profile objects. Example:

```json
[
  {
    "id": "profile-example-1",
    "name": "Main controller",
    "matchPattern": "http://192.168.1.10/*",
    "username": "admin",
    "password": "secret",
    "usernameSelector": "",
    "passwordSelector": "",
    "submitSelector": "",
    "autoSubmit": false,
    "enabled": true,
    "overwriteExisting": true
  }
]
```

### Notes for manual editing

- `matchPattern` can be an exact IP, a full URL, or a wildcard pattern such as `10.0.0.*`
- `usernameSelector`, `passwordSelector`, and `submitSelector` are optional
- `autoSubmit` submits the form after filling
- `enabled` turns a profile on or off without deleting it
- `overwriteExisting` allows the extension to replace values already present in the fields

You can also include multiple match patterns in `matchPattern` separated by commas or new lines.

## Advanced selectors

Most controller pages should work without selectors. If a page uses unusual field names, set:

- `Username selector`
- `Password selector`
- `Submit selector`

Examples:

- Username selector: `input[name="username"]`
- Password selector: `input[type="password"]`
- Submit selector: `button[type="submit"]`

## How to find the right selectors

If a controller page uses unusual field names and autofill does not work automatically, you can discover the selectors directly in Chrome.

### Quick method in Chrome

1. Open the controller login page.
2. Right-click the username field and choose `Inspect`.
3. Chrome DevTools will open and highlight the HTML element for that field.
4. Look for attributes such as `id`, `name`, `type`, `placeholder`, or `class`.
5. Build a selector from the most stable attribute you can find.
6. Repeat the same process for the password field and the login button.

### Best selector choices

Prefer selectors like these:

- `#username`
- `#password`
- `#loginButton`
- `input[name="username"]`
- `input[name="operator-code"]`
- `button[type="submit"]`
- `input[type="password"]`

These are usually more reliable than long selectors copied from the page structure.

### Avoid brittle selectors

Try not to use selectors like:

- `div > div > form > input:nth-child(2)`
- `.panel .row .field input`

These can break if the page layout changes slightly.

### Using "Copy selector"

In DevTools, right-click the highlighted HTML node and choose:

- `Copy`
- `Copy selector`

This gives you a ready-made CSS selector. It can be useful as a starting point, but sometimes Chrome generates selectors that are too long. If that happens, simplify them manually.

Example:

- Chrome may give: `body > div.login-panel > form > input:nth-child(1)`
- Better version: `input[name="username"]`

### What to look for in the HTML

Example username field:

```html
<input id="user" name="username" type="text">
```

Possible selector choices:

- `#user`
- `input[name="username"]`

Example password field:

```html
<input id="pwd" name="device-key" type="password">
```

Possible selector choices:

- `#pwd`
- `input[name="device-key"]`
- `input[type="password"]`

Example login button:

```html
<button id="loginBtn" type="submit">Login</button>
```

Possible selector choices:

- `#loginBtn`
- `button[type="submit"]`

### Practical workflow

If autofill fails on a real controller page:

1. Test automatic mode first with no selectors.
2. If it does not fill, inspect the username field and add `Username selector`.
3. Inspect the password field and add `Password selector`.
4. If auto-submit is needed and does not work, inspect the button and add `Submit selector`.
5. Save the profile and refresh the page.

### Tip

If the page has only one visible password field, `input[type="password"]` is often enough. For the username field, `id` or `name` selectors are usually the safest option.
