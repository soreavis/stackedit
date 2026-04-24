# Changelog

All notable changes to this fork of [`benweet/stackedit`](https://github.com/benweet/stackedit) are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/). Version identifiers use the `x.y.z-fork.N` suffix so upstream semver stays distinguishable.

## [Unreleased]

### Added
- **Explorer multi-select** (Cmd/Ctrl-click to toggle, Shift-click for range in visible order, drag a marquee on empty tree space; hold a modifier during marquee to add to the current selection). Multi-drag moves every selected node in one gesture, drop-to-trash / drop-to-folder / drop-to-root all iterate the set, and a single aggregate `bulkDeletion` modal replaces the per-item prompts ("Move N items to Trash and permanently delete M items (including X folders with their contents). Are you sure?"). Descendants are pruned from the set so a folder's recursive delete doesn't double-process its own children, and the `setDragTarget` circularity check now rejects targets nested inside ANY dragged source.
- **Explorer search** — input below the toolbar filters the tree as you type. Matching files and their ancestor folders stay visible; folders containing a match auto-expand regardless of their user-toggle state; the matched substring is highlighted inline with a yellow pill (brighter yellow on black when the row is also the blue-selected primary). Esc clears. Pure local string match, no network. The input itself fades into the panel when idle (muted background, transparent border) and lights up on hover / focus with a soft blue focus-ring.
- **Clickable folder caret + first-click-selects UX**: regular folders now have a real `<span class="explorer-node__caret">` at the left edge. Clicking the caret toggles open/close independently of selection. Clicking the folder row itself *selects* the folder on first click and *toggles* only on a second click — previously any click both selected and toggled, which users found disorienting when they were trying to see which folder was currently focused before opening it. Trash/Temp sentinels keep the single-click-toggle behavior since they aren't part of multi-select.
- **Top-bar file metadata** — muted 11 px strip left of the filename shows `size · words · lines · reading time · parent path` for the current file, with a richer hover tooltip adding path, character count, reading-time estimate (@ 220 wpm), file id, and last-opened timestamp. Informational only, no storage or network.
- **"No file selected" empty state**: when no file is actively open (delete, close, or workspace-without-files) a centered placeholder card takes over the editor/preview area — icon, headline, hint, and a "New file" button that creates a blank file and switches to it. Subtle 45° striped backdrop; dark/light-theme aware.
- **Close-file button (× in the nav bar)**: deselects the current file and shows the empty state. A session flag (`explorer.userClosedFile`) prevents `localDbSvc`'s watcher from auto-reopening `file/lastOpened`. Opening any real file clears the flag. Session-scoped — a reload still re-opens the last-used file.
- **Auto-discard unedited new files**: when "New file" is triggered from the explorer's `+` button or the empty-state's "New file" button, the freshly-created file is tracked as a draft with a snapshot of its initial text. If the user switches away or closes the file without editing its content, `draftFilesSvc.discardIfUnedited` deletes it instead of leaving an empty `Untitled` stub behind. Imports / clipboard paste / drag-and-drop imports are not marked as drafts.
- **Mermaid in PDF + HTML exports** — previously the async mermaid render finished *after* `exportSvc.applyTemplate` had already serialized `containerElt.innerHTML`, so exports shipped with raw ` ```mermaid ` code fences instead of rendered SVG. `extensionSvc.sectionPreview` now returns `Promise.all` of listener results, mermaid's listener returns its in-flight render promise, and the export pipeline `await`s before reading the DOM. Live preview keeps its fire-and-forget path unchanged.
- **Fit-to-page diagrams in PDF export**: inline print-scoped CSS in the two bundled PDF templates (`styledHtml`, `styledHtmlWithToc`) caps every mermaid SVG to `max-width: 100%` / `max-height: 90vh` and scales down oversize diagrams instead of splitting them across pages. `page-break-inside: avoid` on the wrapper, `page-break-before: avoid` on the wrapper, `break-after: avoid` on all headings and on paragraphs that directly precede a mermaid block (via `:has()`) — so a caption/heading can't get orphaned at the bottom of a page with its diagram on the next one. An info note under the PDF-export modal documents the behavior and the template applicability.
- **Mermaid SVG export + lightbox buttons** increased to 35 × 35 px (was 28) with 18 px glyphs for better hit target. Interactive action buttons are stripped from HTML/PDF exports so diagrams don't ship with a "copy source / enlarge" toolbar baked into the image.

### Changed
- **Folder creation lands at root when the selected folder is collapsed**: clicking the new-folder button with a collapsed folder selected used to bury the new folder inside the closed branch. Now `explorerSvc.newItem` falls through to root instead. Same for new files, since the button shares the code path.
- **Mermaid diagrams are horizontally centered** inside the content column (live preview + HTML export + PDF export) via `text-align: center` on the wrapper + `display: inline-block` on the direct-child SVG.
- **More padding inside mermaid nodes and subgraphs**: flowchart `padding` 8 → 20, `nodeSpacing` / `rankSpacing` 50 → 70, `diagramPadding` 8 → 16, `subGraphTitleMargin { top: 10, bottom: 10 }`. Labels no longer butt up against shape borders or subgraph frames.
- **Sidebar back-to-main-menu icon** changed from the three-dots (`icon-dots-horizontal`) to a left arrow (`icon-arrow-left`), which reads much more clearly as a "back" affordance. Tooltip updated to "Back to main menu".
- **Drag-and-drop to workspace root**: the entire empty area of the file explorer is now a drop zone for "move to document root". Drag any folder or file onto the explorer background (or hover over the root itself during a drag) to move it back to the top level. Previously the only drop target for root was a barely-visible 20 px strip at the bottom of the root file list. A subtle blue inset border highlights the tree while root is the active drop target.

### Fixed
- **Delete-last-file no longer pops open an unrelated collapsed folder**. Root cause was two-fold: `localDbSvc`'s own current-file watcher re-resurrected `file/lastOpened` on null, and `file/lastOpened` happily returned files buried inside collapsed folders (or just-trashed files), which then caused `openNode` to walk up and expand those folders. Fix: `file/lastOpened` now skips files whose ancestor chain contains a collapsed folder (via `rootState.explorer.openNodes`) *or* that live under Trash at any depth. `explorerSvc.deleteItem` (single + bulk paths) picks the next current via a new `pickVisibleReplacement()` that applies the same visibility test. `localDbSvc` only bootstraps a Welcome file when `file/items.length === 0` (truly-empty workspace), not whenever `lastOpened` returns empty.
- **About / Settings / File Properties modals broken when the empty-state was visible**. The `.layout__empty` overlay was using `z-index: 5`, which placed it above `.modal` (no z-index) in the root stacking context. Fix: moved the overlay after the editor/preview panels in DOM order and dropped the z-index, so it stacks above the editor by document order but below anything outside `<layout>`.

### Added (carried over — first published in this release cycle)
- **Mermaid lightbox background toggle**: new "☀ / ☾" button in the lightbox toolbar switches the full-viewport backdrop between the default dark wash and a pure-white surface that blends seamlessly with the diagram background. Useful for light-mode screenshots and presentations. The toolbar, close button, and hint strip keep their dark chrome in both modes so they stay readable either way.
- **Code block copy button**: every rendered fenced code block in the preview gets a hover-revealed "⧉" copy button in the top-right corner, mirroring the Mermaid diagram pattern. Click copies the raw source of the code block to the clipboard; the button flashes ✓ for 1.2 s on success. Mermaid diagram blocks are skipped (they already have their own copy-source button inside the diagram toolbar). Pure client-side, no network.
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
