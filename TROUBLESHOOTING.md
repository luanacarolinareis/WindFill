# Troubleshooting

Common issues and quick fixes for `Controller Login Autofill`.

## The extension does not fill anything

Check these first:

1. Make sure the profile is `Enabled`.
2. Make sure the `Match pattern` actually matches the page URL.
3. Refresh the target page after saving the profile.
4. Open the popup on the target page and check whether it says a profile matched.

If the popup says `No matching profile for this page`, the problem is usually the pattern.

## The profile matches, but the fields stay empty

The login page probably uses unusual field names or custom markup.

Try this:

1. Open the page.
2. Right-click the username field and choose `Inspect`.
3. Find a stable selector such as `#username` or `input[name="operator-code"]`.
4. Put that in `Username selector`.
5. Do the same for `Password selector`.
6. Save and refresh the page.

## Auto submit does not work

The extension may be filling correctly, but it may not know which button or form to submit.

Try this:

1. Inspect the login button.
2. Find a stable selector such as `#loginBtn` or `button[type="submit"]`.
3. Put that value in `Submit selector`.
4. Save and refresh.

## The popup says no matching profile

Check the `Match pattern`.

Examples:

- Exact page: `http://127.0.0.1:8765/test-pages/basic-login.html`
- Whole IP and all paths: `http://127.0.0.1:8765/*`
- Whole controller IP: `http://192.168.1.130/*`
- Wildcard host only: `10.0.0.*`

If you want all URLs under one IP, include `/*` at the end of the full URL base.

## It works on one page, but not another page on the same IP

That usually means:

- the other page has a different path and your match pattern is too specific
- or the login fields are different on that page and need selectors

Use either:

- a broader pattern such as `http://192.168.1.130/*`
- or separate profiles for separate login pages

## Import JSON does not work

Check that:

1. The file is valid JSON.
2. The root value is an array.
3. Each entry is a profile object.

The easiest safe path is:

1. Export a known-good file from the extension.
2. Edit that file.
3. Import it again.

## Export worked, but another machine still does not autofill

Check all of these:

1. The extension was reloaded or installed correctly on the other machine.
2. The profiles were actually imported.
3. The imported `Match pattern` matches the real target URL on that machine.
4. The selectors are still valid on the target page.

## The popup looks broken or outdated after changes

Reload the extension:

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Reload` on the extension
4. Close and reopen the popup

## Passwords are stored locally

This extension stores credentials in `chrome.storage.local` inside the browser profile.

If the machine is shared:

- use a dedicated Chrome profile
- or keep exported JSON files in a secure location

## Good debug checklist

Check these in order:

1. Does the popup say the profile matched?
2. Does the `Match pattern` really fit the page URL?
3. Are the username and password fields normal or do they need selectors?
4. If fill works, does submit need a custom `Submit selector`?
5. Was the extension reloaded after recent changes?
