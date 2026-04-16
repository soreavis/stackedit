# StackEdit (soreavis fork)

[![CI](https://github.com/soreavis/stackedit/actions/workflows/ci.yml/badge.svg)](https://github.com/soreavis/stackedit/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-5.15.4-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-22.x-green?logo=nodedotjs&logoColor=white)
![Vue 2](https://img.shields.io/badge/vue-2.7-42b883?logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/vite-6.4-646cff?logo=vite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-202_passing-brightgreen)

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

- **Build:** Webpack 2 → Vite 6, Node ≥22
- **Deploy:** Express+PM2 → Vercel (4 Edge functions, 1 Node function)
- **Security:** DOMPurify 3.4, Trusted Types CSP, PKCE on GitHub OAuth, rate-limited API routes, hardened response headers, dead-code elimination of the Vue 2 `parseHTML` ReDoS
- **Tests:** Jest (broken) → Vitest with 202 tests
- **Deps:** ~50 unused runtime packages removed, Mermaid 11, KaTeX 0.16, DOMPurify, `normalize-scss` → `modern-normalize`

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
static/             # Landing page, favicon, robots, 404, fonts
test/
  fixtures/         # Paste-ready markdown smoke tests
  unit/hardening/   # Vitest specs for security + API surface
vercel.json         # Install + headers + rewrites + Edge/Node function config
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
