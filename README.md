# StackEdit (soreavis fork)

[![CI](https://github.com/soreavis/stackedit/actions/workflows/ci.yml/badge.svg)](https://github.com/soreavis/stackedit/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-5.15.5--fork.1-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-22.x-green?logo=nodedotjs&logoColor=white)
![Vue 2](https://img.shields.io/badge/vue-2.7-42b883?logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/vite-7.3-646cff?logo=vite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-200_passing-brightgreen)

> **Full-featured, open-source Markdown editor** based on [PageDown](https://code.google.com/archive/p/pagedown/), the Markdown library originally written for Stack Overflow and the other Stack Exchange sites. Fork of [`benweet/stackedit`](https://github.com/benweet/stackedit), modernized for Vercel deployment.

**Try it online:** [stackedit.io](https://stackedit.io/) (upstream's live deployment).

> [!NOTE]
> **This is a fork of [`benweet/stackedit`](https://github.com/benweet/stackedit)** by Benoit Schweblin.
> Upstream is the canonical project and stays licensed Apache-2.0. This fork adds a Vite + Vercel build, a security hardening pass, and a modern test suite. Please file editor-feature requests upstream first.

> [!WARNING]
> **StackEdit stores OAuth access tokens** for connected sync/publish providers (Google Drive, GitHub, Dropbox, GitLab, WordPress, Zendesk, CouchDB) in the browser's IndexedDB + localStorage. Anything with JavaScript access to this origin can read them. Review the source before connecting provider accounts, and consider using dedicated OAuth apps with minimal scopes. The authors are not responsible for provider-account compromise resulting from XSS or malicious browser extensions.

## Features

- WYSIWYG split-pane Markdown editor with live preview
- KaTeX math, Mermaid diagrams, ABC music notation, Prism syntax highlighting
- Sync + publish to Google Drive, GitHub, Dropbox, GitLab, WordPress, Blogger, Zendesk, CouchDB
- PWA with offline-first editing (Workbox service worker)
- Custom Handlebars export templates (HTML, PDF, EPUB, DOCX, RST, LaTeX, …)
- Multiple workspaces, file + folder management
- Collaborative comments on discussions

## What this fork changes vs. upstream

The fork is a modernization + hardening pass on top of upstream's 5.15.4 editor; the user-facing editor itself is unchanged in spirit. The full, version-by-version trail lives in [`CHANGELOG.md`](CHANGELOG.md) — the summary below is what's shipped cumulatively across the fork so far.

### Build & tooling

| Area | Upstream | Fork |
|---|---|---|
| Bundler | Webpack 2 | **Vite 7.3** |
| Dev server | webpack-dev-server | Vite with HMR |
| Test runner | Jest (broken on modern Node) | **Vitest 4** + happy-dom 20 |
| Linter | ESLint 4 | **ESLint 9** flat config + `eslint-plugin-vue` 10 |
| Node target | 10.x | **22.x** |
| Sass | node-sass (deprecated) + `@import` | **Dart Sass** with `@use` / `math.div` / `color.adjust` |
| CSS baseline | `normalize-scss` | `modern-normalize` |
| PWA | workbox via webpack plugin | `vite-plugin-pwa` 1.x |

Bundle: main chunk went from **2.8 MB → 595 KB** (gzipped **828 KB → 154 KB**). Mermaid is lazy-loaded; the template worker is a separate chunk; Vue aliased to the runtime-only build so the `parseHTML` ReDoS parser is dead-code-eliminated from the shipped bundle.

### Deploy

- Express + PM2 (single Node VM) → **Vercel**: 4 Edge-runtime API routes (`/api/conf`, `/api/userInfo`, `/api/cspReport`, `/api/googleDriveAction`), 1 Node route (`/api/githubToken`), 2 stubs (`/api/pdfExport`, `/api/pandocExport`).
- `/api/health` endpoint for uptime monitors.
- **Upstash Redis** distributed rate limiting with a per-instance in-memory fallback for local dev.
- `@vercel/analytics` + `@vercel/speed-insights` (anonymized, DNT-honoring — see [PRIVACY.md](PRIVACY.md)).
- Custom `/404.html`, `/robots.txt`, `/favicon.ico`, `/privacy.html`.
- `vite:preloadError` handler — skew protection for long-lived browser tabs.
- GitHub Actions CI (build + unit on every PR) and Dependabot (weekly npm + github-actions).

### Security hardening

- **DOMPurify 3.4** replaces the forked Angular `$sanitize`; all `v-html` paths route through it (including `CurrentDiscussion`, which was unsanitized upstream).
- **Trusted Types** enforced (`require-trusted-types-for 'script'` + default policy). `'unsafe-eval'` scoped to the template-worker chunk only, via per-file CSP headers in `vercel.json`.
- **CSP**: enumerated `connect-src`, `frame-src` limited to `'self' https://accounts.google.com`, HSTS preload, COOP / CORP, expanded Permissions-Policy.
- **OAuth**: GitHub flow upgraded to **PKCE S256**. Dropbox / Google Drive scopes kept minimal.
- **API routes**: `sameOrigin` check, body-size caps, IP-keyed rate limits, masked error bodies.
- `target="_blank"` anchors auto-get `rel="noopener noreferrer"` (36 anchors across 16 files).
- Source maps disabled in production builds.
- Removed third-party script loaders (Google `apis.google.com/js/api.js` offline check, landing-page `stackedit.io/style.css`).
- Removed the deprecated AppCache manifest from the landing page.

### Dependency modernization

- **Removed ~50 webpack-era devDeps** (loaders, gulp, node-sass, stylelint, etc.) — Vite handles those natively.
- **Removed unused runtime deps**: `aws-sdk`, `request`, `body-parser`, `compression`, `serve-static`, `tmp`, `google-id-token-verifier`, `indexeddbshim`, `babel-runtime`.
- **Replaced** (Nov 2025 pass): `mousetrap@1.6.5` (unmaintained, last release Jan 2020) → **tinykeys 3**; `file-saver` 1 → 2; `bezier-easing` 2 → 3; legacy `markdown-it-imsize` fork → in-repo shim; custom clipboard plugins → native async Clipboard API.
- **Bumped**: Mermaid 11, KaTeX 0.16, Prism 1.30, happy-dom 20, DOMPurify 3.4, `vite-plugin-pwa` 1.2, Vite 7.3, Vitest 4.1.

### Features added by the fork

- **Import from clipboard** (`Import/Export` menu) — reads both `text/html` and `text/plain` flavors, prefers plain text when it already looks like Markdown (avoids Turndown's defensive escaping of `#`/`*`/`-`/`` ` ``), otherwise runs HTML through sanitize + Turndown. Auto-derives the filename from the first heading.
- **Clipboard image paste** directly into the editor.
- **Google Drive image picker** replacing the dead Google Photos picker.
- **Open Graph + Twitter-card meta tags** for link previews.
- **About modal rebranded**: `Community Fork` pill, dual copyright line, fork-first link set, dead upstream-only links pulled.
- **Privacy Policy**: canonical [`PRIVACY.md`](PRIVACY.md) + static [`/privacy.html`](static/privacy.html) mirror (hand-synced, no build step).

### Fork-specific bug fixes

- **Scroll-sync regression** (bezier-easing v3 dropped the v2 `.get()` / `.toCSS()` methods). `animationSvc` re-attaches them as shims on the returned function so the animation loop doesn't throw on every frame.
- **Shortcuts init TDZ** ReferenceError at module load — hoisted the `expansions` const above its `immediate: true` watcher in `shortcuts.js`.

### Tests

- **200 specs** across 16 files under `test/unit/hardening/` covering: sanitizer XSS vectors, rate limiter, API handlers, GitHub OAuth PKCE, template worker sandbox, `vercel.json` contract, markdown-it plugins.
- Paste-ready manual fixtures under `test/fixtures/` for browser smoke-testing (KaTeX, Mermaid, YAML front-matter, API curl recipes, sanitizer vectors).

### Release & versioning

- **Semver prerelease suffix**: `5.15.5-fork.1`, `5.15.5-fork.2`, … Stays distinguishable from any future upstream release. Next upstream bump rebases us to `<upstream>-fork.1`. Tracked in [`CHANGELOG.md`](CHANGELOG.md).
- **Three-branch model** — see [Branching model](#branching-model) below.

## Branching model

| Branch | Purpose | Protection |
|---|---|---|
| `master` | Stable. Deployed to production. | PR required, 0 approvals, convo resolution required, no force-push, no deletion |
| `develop` | Integration. Features land here first. | PR required, 0 approvals, no force-push, no deletion |
| `next` | Experimental / preview. Useful for sharing work-in-progress. | No PR required, force-push allowed, no deletion |

Flow for a typical change:

1. Branch off `develop`: `git checkout -b fix/<slug> develop` (or `feat/<slug>`, `chore/<slug>`, `docs/<slug>`, `build/<slug>`).
2. Open a PR into `develop`.
3. When `develop` is ready to cut, open a PR from `develop` → `master`. After merge, fast-forward `next` to match `master`.

Commit prefixes follow [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `chore`, `build`, `refactor`, `test`, `style`.

## Upstream sync

This fork intentionally keeps `master` as the default branch (matching upstream's `benweet/stackedit`) so that pulling upstream changes stays a one-liner and PRs back upstream don't hit a branch-name mismatch.

One-time setup for contributors:

```bash
git remote add upstream git@github.com:benweet/stackedit.git
git fetch upstream
```

### Pulling upstream changes into this fork

`master` is protected — direct pushes are blocked. Route upstream commits through a short-lived sync branch and open a PR so CI runs and the Vercel preview deploys before the merge hits production:

```bash
git fetch upstream
git checkout -b chore/upstream-sync-$(date +%Y%m%d) develop
git merge upstream/master         # resolve any conflicts here
git push -u origin chore/upstream-sync-$(date +%Y%m%d)
gh pr create --base develop --title "chore: sync upstream master"
```

Merge into `develop`, then open the usual `develop → master` promotion PR. If upstream ships a new version, bump the fork version in the **same** sync PR: e.g. upstream `5.16.0` → fork `5.16.0-fork.1`. Update `package.json` and open a fresh `[5.16.0-fork.1]` section in `CHANGELOG.md`.

### Sending a change back upstream

1. Make sure the change is upstream-relevant (editor features, editor bug fixes, cross-cutting improvements). Fork-specific infra (Vercel routing, Upstash, Privacy Policy, the `fork.N` suffix scheme) should **not** be PR'd upstream.
2. Cherry-pick or recreate the change on a branch off `upstream/master`:
   ```bash
   git fetch upstream
   git checkout -b upstream-pr/<slug> upstream/master
   git cherry-pick <sha>         # or rewrite cleanly
   ```
3. Push that branch to your own fork of upstream (if you have one) or to this fork under a clearly-named branch, then open a PR against `benweet/stackedit:master`.
4. Keep the commit message / PR description free of fork-specific context (branch names, Upstash refs, etc.) — upstream maintainers see this as a drive-by contribution.

## Prerequisites

- Node.js 22.x
- npm ≥9

## Quick Start

```bash
git clone git@github.com:soreavis/stackedit.git
cd stackedit
npm install --legacy-peer-deps   # required: some Vue-2-era devDeps have old peers
npm run dev                      # http://localhost:8080
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR (port 8080) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run unit` | Run the Vitest suite |
| `npm run unit-with-coverage` | Coverage → `coverage/` |
| `ANALYZE=1 npm run build` | Emit `dist/bundle-analysis.html` |

## Deployment (Vercel)

1. Import the repo in Vercel (or `vercel link`).
2. Set these **Environment Variables** (Production + Preview) before the first deploy:

   | Variable | Purpose | When |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | Google Drive OAuth | Build-time (baked into bundle) |
   | `GITHUB_CLIENT_ID` | GitHub OAuth | Build-time |
   | `GITHUB_CLIENT_SECRET` | `/api/githubToken` token exchange | Runtime |
   | `DROPBOX_APP_KEY` | Dropbox OAuth (app folder scope) | Runtime (from `/api/conf`) |
   | `DROPBOX_APP_KEY_FULL` | Dropbox OAuth (full dropbox scope) | Runtime (from `/api/conf`) |
   | `WORDPRESS_CLIENT_ID` | WordPress OAuth | Runtime |
   | `GOOGLE_API_KEY` | Google APIs | Runtime (restrict by HTTP referrer) |
   | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Optional — enables distributed rate limiting | Runtime |

3. The `vercel.json` pins `npm install --legacy-peer-deps` as the install command — Vercel's default `npm install` fails on the Vue-2-era peer graph without it.
4. Vercel auto-deploys on push to `master`.

## Testing

```bash
npm run unit
```

202 tests across 16 files under `test/unit/hardening/`. Paste-ready manual fixtures under `test/fixtures/` for browser smoke-testing (sanitizer XSS vectors, KaTeX, Mermaid, YAML front-matter).

## Project structure

```
api/                # Vercel serverless/Edge functions
dev-server/         # Vite dev middleware for PDF/Pandoc export
src/
  components/       # Vue 2 SFCs (app shell, modals, menus)
  extensions/       # markdown-it plugins (KaTeX, Mermaid, emoji, …)
  icons/            # SVG icon components
  libs/             # htmlSanitizer (DOMPurify), pagedown, clunderscore
  services/         # Vuex-adjacent services (editor, sync, network, templateWorker)
  store/            # Vuex modules
  styles/           # SCSS
static/             # Landing page, favicon, robots, 404, privacy.html, fonts
test/
  fixtures/         # Paste-ready markdown smoke tests
  unit/hardening/   # Vitest specs for security + API surface
vercel.json         # Install + headers + rewrites + Edge/Node function config
CHANGELOG.md        # Keep-a-Changelog, `x.y.z-fork.N` versioning
PRIVACY.md          # Canonical privacy policy (mirrored to static/privacy.html)
```

## Upstream ecosystem

These are all maintained by the upstream project, not this fork, and still work with or against the upstream `stackedit.io` deployment. Linked here so fork users know they exist:

- [Chrome app](https://chrome.google.com/webstore/detail/iiooodelglhkcpgbajoejffhijaclcdg)
- [`stackedit.js`](https://github.com/benweet/stackedit.js) — embed StackEdit in any website
- [Chrome extension](https://chrome.google.com/webstore/detail/ajehldoplanpchfokmeempkekhnhmoha) (uses `stackedit.js`)
- [Community forum](https://community.stackedit.io/)

## Credits

- **Original author:** [Benoit Schweblin](https://github.com/benweet) — the entire StackEdit editor + ecosystem. Fork maintained in parallel with, not in replacement of, the upstream repo.
- **Fork maintained by:** [Julian Soreavis](https://github.com/soreavis)
- **Community:** [community.stackedit.io](https://community.stackedit.io/) (upstream's)

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

This fork preserves the upstream license, copyright, and NOTICE file verbatim. All original StackEdit code remains © 2014–2023 Benoit Schweblin. Modifications by fork maintainers are also licensed under Apache-2.0.
