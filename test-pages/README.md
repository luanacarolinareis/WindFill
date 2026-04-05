# Test pages

Use these pages to test the extension locally without needing the real controller websites.

For common setup or matching problems, see [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md).

## Start a local server

Run this in the project root:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

- `http://127.0.0.1:8765/test-pages/basic-login.html`
- `http://127.0.0.1:8765/test-pages/selector-login.html`

## Suggested profile for the basic page

- Match pattern: `http://127.0.0.1:8765/test-pages/basic-login.html`
- Username: anything you want
- Password: anything you want
- Auto submit: optional

## Suggested profile for the selector page

- Match pattern: `http://127.0.0.1:8765/test-pages/selector-login.html`
- Username selector: `#operator-code`
- Password selector: `#device-key`
- Submit selector: `#enter-device`

## After filling a profile

- Click `Save`
- Refresh the test page
- If the extension is working, the fields should be filled automatically
- If `Auto submit` is enabled, the status box on the page should show that submit was intercepted
