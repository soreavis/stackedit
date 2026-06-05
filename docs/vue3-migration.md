# Vue 2.7 → Vue 3 migration plan

Status: **in progress** (branch `feat/vue3-migration`). This document is the
working plan; update the batch checkboxes as work lands.

## Goal & strategy

Migrate from **Vue 2.7.16** to **Vue 3.5.x** using the official **migration
build (`@vue/compat`)** so the app keeps booting and shipping at every step.

`@vue/compat` is Vue 3 running in "Vue 2 mode": legacy APIs (`new Vue()`,
`$on/$emit`, `filters`, old `slot=`, custom-directive hooks, …) keep working
but emit **runtime deprecation warnings**. We burn those warnings down
per-component, flip each to "Vue 3 clean", and only remove `@vue/compat` once
the warning count hits zero. No big-bang rewrite, no weeks-long broken branch.

Options API stays — Vue 3 fully supports it. Converting components to
`<script setup lang="ts">` is a **separate, later** effort (see
`vue3-migration.md` §"After"), unblocked by this work via `vue-tsc`.

## Why this codebase is a favorable case

The expensive cost-centers that make Vue 2→3 a multi-month slog are **absent**:

| Usual pain | Here |
|---|---|
| Vuex → Pinia | already Pinia (2.3) |
| vue-router v3→v4 | no router (SPA editor) |
| UI framework (Vuetify/Quasar) port | none |
| `.sync` | 0 |
| `mixins` | 0 |
| `$listeners` | 0 |
| functional components | 0 |
| custom `v-model` (`model:` option) | 0 |
| component-mount test specs (`@vue/test-utils`) | 0 |

## Current-state inventory (measured 2026-06-05)

- **81 app components / ~12.5k LOC** (+ 78 trivial icon SFCs). Largest:
  ExplorerNode (868), NavigationBar (805), Modal (666), Explorer (543).
- **EventBus**: `editorSvc = Object.assign(new Vue(), …)` + **15** `$on/$off/$once`
  call sites + 13 `$emit`. The one architectural refactor → `mitt`.
- **Global API / bootstrap**: `index.js` (`new Vue`), `pinia.js`
  (`PiniaVuePlugin`), `vueGlobals.js` (4 `Vue.directive` + 1 `Vue.filter`),
  `icons/index.js` (78 `Vue.component`).
- **Old `slot="…"`**: ~149 (mostly menu entries). Mechanical → `v-slot`/`#`.
- **Custom directives**: 4 (`focus`/`show`/`title`/`clipboard`) — hook renames.
- **CSS transition classes** (the only change with NO runtime warning):
  `Modal.vue` `.modal-fade-enter`, `.tab-swap-enter` → `-enter-from`.
  `ExplorerNode` transition uses JS hooks → unaffected.
- **Reactivity** `this.$set`/`Vue.set`: 3. **filters**: 2. **render()**: 2.

## Tooling / dependency changes

| Remove | Add / bump |
|---|---|
| `vue@2.7` | `vue@3.5.35` |
| `vue-template-compiler` | `@vue/compiler-sfc@3.5.35` |
| `@vitejs/plugin-vue2` | `@vitejs/plugin-vue@6.0.7` |
| — | `@vue/compat@3.5.35` (temp bridge, removed at the end) |
| — | `mitt@3.0.1` (EventBus replacement) |
| `@vue/test-utils@1` | `@vue/test-utils@2.4.11` (0 specs use it — hygiene only) |

`vite.config.mjs`: swap `vue2()` → `vue({ template: { compilerOptions: {
compatConfig: { MODE: 2 } } } })`, alias `vue` → `@vue/compat`.

**Unblocks later:** `@vitejs/plugin-vue` 6 supports Vite 7 **and 8**; Pinia 3;
`vue-tsc` template type-checking; native Pinia (no `PiniaVuePlugin`).
⚠️ Vite 8 itself is still gated by `vite-plugin-pwa`'s `^7` peer cap (upstream),
**independent** of this migration.

## Batch plan

Each batch is independently shippable; the app boots + tests pass at every
boundary. Verification = build + dev-server boot + Playwright render check +
console-error/warning capture (the established pattern in this repo).

- [ ] **Batch 1 — deps + `@vue/compat` boot (MODE 2).** Swap deps + vite
  config; convert the bootstrap (`index.js` → `createApp().use(pinia).mount`,
  `pinia.js` → drop `PiniaVuePlugin`). Get the app booting on the Vue 3 runtime
  with most code unchanged. **Capture the full deprecation-warning inventory** —
  it becomes the precise worklist for batches 3–6.
- [ ] **Batch 2 — `editorSvc` EventBus → `mitt`.** Replace
  `Object.assign(new Vue(), …)` with a `mitt` emitter; update the 15
  `$on/$off/$once` + 13 `$emit` call sites. Highest-care item (central editor↔
  preview↔discussions wiring) — single-threaded, heavily verified.
- [ ] **Batch 3 — global registration.** `Vue.component`/`Vue.directive`/
  `Vue.filter` → app-scoped (`app.component`/`app.directive`, filter → method or
  `globalProperties`). Custom-directive hook renames (`bind`→`beforeMount`, …).
- [ ] **Batch 4 — `slot=` sweep.** ~149 old `slot="x"` → `v-slot:x` / `#x`.
  **Parallelizable → workflow fan-out** (per-file, worktree-isolated) + verify.
- [ ] **Batch 5 — lifecycle + transition + filters.** `beforeDestroy`→
  `beforeUnmount`, `destroyed`→`unmounted` sweep; CSS transition-class renames
  (hand-done — no warning); 2 filters → methods.
- [ ] **Batch 6 — per-component MODE 2 → 3.** Flip each component's
  `compatConfig` to clean as its warnings reach zero. **Workflow fan-out**
  (discover-fix-verify per component) is ideal here.
- [ ] **Batch 7 — drop `@vue/compat`.** Remove the alias + compat config once
  warnings are zero; bump Pinia 2→3; confirm `@vue/test-utils@2`.
- [ ] **Batch 8 (optional) — add `vue-tsc`** to the typecheck gate; begin
  components → `<script setup lang="ts">` (separate roadmap item).

## Where workflows fit (hybrid)

- **Main loop (sequential, must keep app booting):** Batches 1, 2, 3, 7.
- **Workflow fan-out (parallel, worktree-isolated + verify pass):** Batch 4
  (`slot=` sweep), Batch 6 (per-component cleanup), and verification passes
  (per-component "renders + zero new console errors").
- **Not** a single mega-workflow editing all components at once — shared files +
  must-boot-at-each-step make that counterproductive.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `editorSvc` emitter refactor breaks editor↔preview wiring | med | localized; mitt is a drop-in; verify live after Batch 2 |
| Pinia injection misbehaves under compat | med | convert bootstrap to `createApp`+`app.use(pinia)` in Batch 1 (Vue 3 path), don't rely on `PiniaVuePlugin` |
| Global component/directive registry not applied under `createApp` | low-med | compat bridges the global registry; verify icons + `v-title`/`v-focus` render at boot |
| CM6 bridge | low | framework-agnostic; create in `mounted`, hold non-reactive, `destroy()` on unmount |
| Silent transition-class break (no warning) | low | enumerated above (Modal.vue); hand-fix in Batch 5 |
| `@vue/compat` doesn't cover an undocumented internal we use | low | StackEdit uses no UI lib / router; in-tree md-it plugins don't touch Vue |

## Verification per batch

1. `npm run build` clean.
2. `npm run typecheck` + `npm run lint` clean.
3. `npm run unit` 479/479 (hardening specs are Vue-version-agnostic).
4. Dev-server boot + Playwright: editor mounts, file tree renders, a doc
   renders in preview, **zero console errors**; capture remaining compat
   **warnings** as the next worklist.
