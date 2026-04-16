# target="_blank" + CSP regression test

## Outbound links

All links below should open in a new tab AND, in DevTools → Elements, have `rel="noopener noreferrer"` set (either because markdown-it rendered them through the sanitizer, or because the editor / nav bar hardcoded the rel earlier).

- Plain markdown: [Example](https://example.com)
- HTML inline: <a href="https://example.com" target="_blank">Example (HTML)</a>
- HTML without target: <a href="https://example.com">Example (same tab)</a> — no rel needed, should open in this tab.

## OAuth popup smoke check

Menu → "Workspaces" → "Add workspace" → pick Google / GitHub / Dropbox / GitLab / WordPress / Zendesk in turn.

Each should open the provider's OAuth screen in a popup and return to the editor. If CSP blocks anything, you'll see a `Content-Security-Policy` violation in DevTools → Console referencing `frame-src` or `connect-src` and the origin we need to add.

Known OAuth origins already allowed in CSP (`vercel.json`):
- `https://accounts.google.com`
- `https://apis.google.com`
- `https://content.googleapis.com`
- plus `connect-src https:` covers XHR to any provider.

If a CSP violation fires, copy the blocked origin from the console and add it to `frame-src` or `script-src` in `vercel.json`.

## Outbound nav links inside the app

- About modal — all links should open in a new tab with `rel="noopener noreferrer"`.
- File sync location toolbar icons — same.
- Tour modal "star us on GitHub" — same.
