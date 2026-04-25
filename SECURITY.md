# Security Policy

## Scope

This policy covers the entire codebase — the Vercel API routes (`api/`), dev-server middleware (`dev-server/`), build config (`vite.config.mjs`, `vercel.json`), HTML sanitizer, OAuth integration code, and the rest of the editor / sync / markdown surface inherited from `benweet/stackedit`.

Upstream `benweet/stackedit` has been dormant since 2023-05-27 and no longer accepts security reports — please report all vulnerabilities here directly. Apache-2.0 attribution to Benoit Schweblin is preserved per license obligations, but ongoing security maintenance is the responsibility of this codebase.

## Supported versions

| Version | Supported |
|---|---|
| `main` (HEAD) | Yes — security patches land here and are auto-deployed |
| `5.16.x` (current release line) | Yes — patched on `main` |
| `5.15.x` and earlier (upstream `benweet/stackedit`) | No — see upstream repository (dormant since 2023-05-27) |

Numbered releases are tracked in [`CHANGELOG.md`](CHANGELOG.md). Security fixes land on `main` first and are tagged into the next patch / minor release.

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
