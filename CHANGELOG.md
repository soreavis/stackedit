# Changelog

All notable changes to this fork of [`benweet/stackedit`](https://github.com/benweet/stackedit) are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). Version identifiers use the `x.y.z-fork.N` suffix so upstream semver stays distinguishable.

## [Unreleased]

### Added
- **Drag-and-drop import**: drop `.md` / `.markdown` files (or whole folders of them) onto the file explorer panel to import them. Drop target determines the destination — drop on a folder lands inside it, drop on a file lands in its parent, drop on the empty area lands at the workspace root. Folder structure is mirrored; non-markdown files are silently skipped. Uses `FileReader` + `FileSystemEntry`, no network.
- **Mermaid diagram lightbox**: each rendered Mermaid diagram gets a hover-revealed "⤢ Enlarge" and "⧉ Copy source" button. Enlarge opens a fullscreen viewer that defaults to fit-to-viewport with drag-to-pan, scroll-to-zoom (cursor-anchored), and a toolbar for zoom in / zoom out / reset / copy source. Double-click the diagram to reset to fit. Esc or the × button closes. The copy button writes the original Mermaid source to the clipboard for pasting into external tools (mermaid.live, etc.).
- **Mermaid diagram export**: two new toolbar buttons in the lightbox — **SVG** downloads the diagram as a standalone `.svg` file (portable, self-contained — mermaid inlines fonts and styles); **PNG** rasterizes at 3× natural resolution for retina-ready screenshots. Flowchart `<foreignObject>` labels are swapped for plain SVG `<text>` in the PNG pipeline so the canvas isn't tainted. Pure client-side, no network.

## [5.15.5-fork.1] - 2026-04-17

First tagged release of the community fork. Cumulates the full hardening pass plus the first fork-branded UI.

### Added
- **Import from clipboard** menu entry in the Import/Export side-bar. Reads both `text/html` and `text/plain` clipboard flavors, prefers plain text when it already looks like Markdown (≥2 of: ATX heading, bullet, ordered list, code fence, bold, link, blockquote, hr, inline code), otherwise sanitizes + Turndowns the HTML. Auto-derives the file name from the first heading.
- `importClipboard` feature badge.
- Fork attribution in the About modal (version line + copyright + "Community Fork" badge + link rewrites to this repo).
- Vercel deployment: 4 Edge-runtime API routes (`conf`, `userInfo`, `cspReport`, `googleDriveAction`), 1 Node route (`githubToken`), 2 stubs (`pdfExport`, `pandocExport`).
- `/api/health` endpoint for uptime monitors.
- Upstash-backed distributed rate limiting with per-instance in-memory fallback.
- Paste-ready markdown test fixtures under `test/fixtures/` (KaTeX, Mermaid, sanitizer XSS vectors, YAML front-matter, API curl recipes).
- 202 Vitest specs under `test/unit/hardening/` covering sanitizer, rate limiter, API handlers, PKCE, template worker sandbox, `vercel.json` contract, and markdown-it plugins.
- `@vercel/analytics` + `@vercel/speed-insights` injection.
- `vite:preloadError` handler (skew protection for long-lived tabs).
- Custom `/404.html`, `/robots.txt`, root `/favicon.ico`.
- GitHub Actions CI (build + unit on every PR).
- Dependabot config (weekly npm + github-actions).

### Changed
- Vite 5 → Vite 6.4; Vitest 1 → Vitest 2.
- Vue aliased to runtime-only build (`vue/dist/vue.runtime.esm.js`) — the `parseHTML` ReDoS parser is now dead-code-eliminated from the shipped bundle.
- DOMPurify 3.4 replaces the forked Angular `$sanitize`.
- Trusted Types enforced (`require-trusted-types-for 'script'` + default policy); `'unsafe-eval'` scoped to the template-worker chunk only via per-file CSP.
- Tight CSP: enumerated `connect-src`, `frame-src` limited to `'self' https://accounts.google.com`, HSTS preload, COOP/CORP, expanded Permissions-Policy.
- OAuth: GitHub flow upgraded to PKCE S256.
- API routes: `sameOrigin` check, body-size caps, rate limits, masked error bodies.
- Build chunking: main bundle 2.8 MB → 595 KB (gz 828 KB → 154 KB). Mermaid is lazy-loaded.
- Sass modernized: `@import` → `@use`, `mix`/`lighten`/`darken`/`transparentize` → `color.adjust`, `/`-division → `math.div`. `normalize-scss` → `modern-normalize`.
- `js-yaml` 3 → 4, `handlebars` 4.0.10 → 4.7.8, `turndown` 4 → 7, `katex` 0.13 → 0.16, `mermaid` 8 → 11.
- Node engine pinned to `22.x`.
- Default branch remains `master` (matches upstream convention).

### Removed
- ~48 webpack-era devDeps (loaders, gulp, node-sass, stylelint, etc.) — Vite handles these.
- Unused runtime deps: `aws-sdk`, `request`, `body-parser`, `compression`, `serve-static`, `tmp`, `google-id-token-verifier`, `indexeddbshim`, `babel-runtime`.
- Upstream's Travis CI configuration (replaced with GitHub Actions).

### Fixed
- Scroll-sync: `animationSvc` calls re-wired for `bezier-easing@3` (library dropped the `.get()` / `.toCSS()` methods between v2 and v3). Preview pane again tracks editor scroll while the toggle is on.
- Keyboard shortcuts init: hoisted the `expansions` const above the `immediate: true` watcher in `shortcuts.js` to fix a TDZ `ReferenceError` at module load.

### Security
- DOMPurify replaces regex-based sanitizer; all `v-html` paths now route through it (including `CurrentDiscussion`, which was unsanitized upstream).
- `target="_blank"` anchors auto-get `rel="noopener noreferrer"` (36 anchors across 16 files).
- Dev server blocks `/api/*` source disclosure.
- Pandoc dev middleware validates metadata keys against `/^[A-Za-z0-9_-]{1,64}$/` and strips CR/LF from values.
- Source maps disabled in production builds.
- Third-party script loaders (Google `apis.google.com/js/api.js` offline check, landing-page `stackedit.io/style.css`) removed.
- AppCache manifest (deprecated) removed from landing page.

See [`feat(security)` commit](https://github.com/soreavis/stackedit/commit/4c87b6b) for the initial hardening pass; subsequent commits build on it.

## Prior history (upstream)

For changes before this fork diverged, see [upstream releases](https://github.com/benweet/stackedit/releases). Upstream's last published tag when this fork began was **v5.15.4** (Dec 2023).
