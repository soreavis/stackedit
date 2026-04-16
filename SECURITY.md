# Security Policy

## Scope

This policy covers the **fork-specific code** in this repository: the Vercel API routes (`api/`), dev-server middleware (`dev-server/`), build config (`vite.config.js`, `vercel.json`), HTML sanitizer, and OAuth integration code added by the fork.

For vulnerabilities in upstream StackEdit code (editor, sync providers, markdown rendering, Vuex store), please **report upstream first** at [`benweet/stackedit`](https://github.com/benweet/stackedit/security). If the issue is exploitable specifically on this fork's Vercel deployment and not upstream, report it here.

## Supported versions

| Version | Supported |
|---|---|
| `master` (HEAD) | Yes |
| `5.15.x` upstream | See upstream repository |

This fork does not currently publish numbered releases. Security patches land on `master` and are auto-deployed.

## Reporting a vulnerability

**Do not open a public issue or PR for security vulnerabilities.**

Report privately via **[GitHub Security Advisories](https://github.com/soreavis/stackedit/security/advisories/new)** (preferred).

Include:
- Affected component (API route, sanitizer, OAuth flow, CSP bypass, …)
- Reproduction steps
- Impact assessment
- Suggested fix (if any)

Response target: 72 hours for acknowledgement. Please allow 30 days for a fix + disclosure window before going public; more if the fix requires coordination with upstream or an OAuth provider.

## Known sensitive surface

Users should understand what this application handles:

| Data | Where it lives | Exposure |
|---|---|---|
| OAuth access tokens (Google Drive, GitHub, Dropbox, GitLab, WordPress, Zendesk, CouchDB) | IndexedDB + localStorage on the browser | Any JS running same-origin can read them. Mitigated by strict CSP + DOMPurify on every v-html path. |
| Document content | IndexedDB (offline), plus user-chosen sync provider | Up to the user's provider choice. |
| Public OAuth client IDs | Bundled in the built JS | Intentional — these are not secrets. |
| `GITHUB_CLIENT_SECRET`, `DROPBOX_APP_KEY`, etc. | Vercel environment variables (server-side only) | Never shipped to the browser. |

## Security hardening in place

- **CSP** with `require-trusted-types-for 'script'`, enumerated `connect-src`, no `'unsafe-eval'` on the main thread (scoped only to the template worker chunk).
- **DOMPurify 3.4** on every `v-html` binding.
- **PKCE S256** on GitHub OAuth.
- **Rate limiting** on all API routes (Upstash-backed when configured, in-memory fallback).
- **`sameOrigin` check** on `/api/githubToken`.
- **Body-size caps** on all POST endpoints.
- **CSP violation reporting** to `/api/cspReport`.
- HSTS preload, COOP, CORP, XFO, XPCDP, expanded Permissions-Policy.
- Vue runtime-only alias (drops the `parseHTML` ReDoS dead code from the shipped bundle).

## Not a vulnerability

- A same-origin script can read OAuth tokens from IndexedDB. This is the inherent trust model of an SPA that manages its own tokens. Mitigated but not eliminated.
- The CSP violation endpoint logs to Vercel function logs, not to a SIEM.
- Rate limiting without Upstash is per-instance and best-effort.

## Coordinated disclosure

If the vulnerability exists in a dependency (e.g., DOMPurify, Mermaid, Handlebars), please also report upstream to the dependency's project after we've had a chance to patch. We will credit reporters in the advisory unless they prefer to remain anonymous.
