# Contributing

Thanks for taking the time to contribute.

## Project status

This codebase is an independent successor to [`benweet/stackedit`](https://github.com/benweet/stackedit), which has been dormant since 2023-05-27. We preserve Apache-2.0 attribution to Benoit Schweblin (LICENSE, NOTICE, About modal) but no longer track upstream commits — feature requests, bug reports, and editor work all belong here.

If a change is genuinely upstream-relevant and you'd also like to send it to `benweet/stackedit`, that's welcome but optional; this repo is the active project.

## Getting started

```bash
git clone git@github.com:soreavis/stackedit.git
cd stackedit
npm install --legacy-peer-deps
npm run dev
```

Dev server: http://localhost:8080

## Running tests

```bash
npm run unit                  # 231 tests under test/unit/hardening/
npm run unit-with-coverage    # HTML coverage in ./coverage/
```

Manual browser smoke tests live in `test/fixtures/` — paste them into a doc on the running dev server.

## Linting

ESLint 9 flat config in `eslint.config.mjs` (replaced upstream's broken legacy config). `npm run lint` runs on every PR in CI and **fails on any error**; warnings don't block merge but are tracked. Run `npm run lint -- --fix` locally to auto-fix the cosmetic ones before pushing.

## Submitting changes

1. Fork the repo (on top of this fork if you're targeting fork-specific work).
2. Create a branch: `feature/…`, `fix/…`, `security/…`, `docs/…`.
3. Make your changes. Keep them narrowly scoped.
4. Run `npm run build` and `npm run unit` — both must pass.
5. Open a PR against `develop`. Promotion to `main` happens via a separate `develop → main` PR when a release is cut.
6. CI will run on your PR. Fix anything red before requesting review.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `security:`. Scope is optional.

## Licensing

By contributing, you agree your contribution is licensed under the **Apache License, Version 2.0** — the same license as the upstream project. Do not relicense, remove, or replace `LICENSE`, `NOTICE`, or the upstream attribution in the README. These are preserved verbatim per Apache-2.0 obligations.

## Cherry-picking from upstream (optional)

Upstream is dormant, so there's no routine sync. If you want to pull a specific upstream commit:

```bash
git remote add upstream git@github.com:benweet/stackedit.git   # one-time
git fetch upstream
git cherry-pick <upstream-sha>
# Resolve conflicts manually — file layout has diverged.
```
