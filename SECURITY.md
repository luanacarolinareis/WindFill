# Security Policy

This document describes the current security posture of WindFill and the recommended way to evaluate and operate it in a controlled environment.

## Scope

This policy applies to:

- the latest code published in this repository
- the latest packaged release ZIP produced from this repository

## Security model

WindFill is intentionally small and easy to inspect.

- It is designed to work fully offline after installation.
- It does not use an external API, backend, telemetry, analytics, or remote service.
- It does not ship with third-party runtime SDKs or remote scripts.
- Runtime behavior is implemented in plain HTML, CSS, and JavaScript stored directly in this repository.
- Profiles, usernames, and passwords are stored locally in `chrome.storage.local`.
- Encrypted WindFill export files can be created with a passphrase for transfer or backup.
- WindFill does not separately encrypt credentials already stored inside the Chrome profile.

## Data handling notes

- Profile data remains local to the Chrome profile unless a user explicitly exports it.
- The default export flow produces an encrypted JSON envelope protected by a user-supplied passphrase.
- Legacy plaintext JSON imports are still accepted for backwards compatibility.
- Any decrypted profile data that is imported is then stored locally in `chrome.storage.local`.

## Recommended deployment controls

For enterprise or operational use, the following controls are recommended:

- use a dedicated Chrome profile for operational access
- restrict local workstation access to approved personnel
- protect the Windows account, browser profile, and disk with normal endpoint controls
- prefer least-privilege controller accounts where possible
- prefer encrypted WindFill exports instead of legacy plaintext JSON files
- treat exported files and their passphrases as sensitive secrets
- review the unpacked source locally before loading or updating the extension
- if the target estate is fixed, consider maintaining a narrower private manifest with reduced host scope for internal deployment review

## Important limitations

WindFill is not:

- a password vault
- an enterprise secrets manager
- a DLP product
- an endpoint hardening tool
- a substitute for workstation security controls

## Reporting a vulnerability

Please report suspected vulnerabilities privately to Luana Carolina Reis before public disclosure.

Use the contact details published on:

- `https://luanacarolina.me`
- the repository owner profile on GitHub

When reporting, include:

- the WindFill version or commit
- the Chrome version
- the impacted page or environment
- the minimum reproduction steps
- whether any credential exposure occurred

Do not include live credentials, production secrets, or sensitive controller details in a public GitHub issue.

## Disclosure approach

WindFill aims for coordinated, private handling of security issues first, followed by a fix or mitigation and only then public disclosure when appropriate.
