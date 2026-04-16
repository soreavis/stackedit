# Contributing

Thanks for taking the time to contribute.

## Upstream first

This is a fork. **Feature requests and bug reports about StackEdit's editor, markdown rendering, or sync providers should go to [`benweet/stackedit`](https://github.com/benweet/stackedit/issues) first.** This fork tracks upstream and should accumulate only fork-specific work:

- Vercel deployment + Edge runtime
- Security hardening (CSP, sanitizer, rate limits)
- Modern tooling (Vite, Vitest, Sass modules)
- Upstash rate limiter

If you're unsure where a change belongs, open an issue here and we'll triage.

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
npm run unit                  # 202 tests under test/unit/hardening/
npm run unit-with-coverage    # HTML coverage in ./coverage/
```

Manual browser smoke tests live in `test/fixtures/` — paste them into a doc on the running dev server.

## Linting

The upstream ESLint config is broken (config extends an ancestor that doesn't resolve). Lint is not run in CI. If you fix the config, please open a PR separately — keep it narrow.

## Submitting changes

1. Fork the repo (on top of this fork if you're targeting fork-specific work).
2. Create a branch: `feature/…`, `fix/…`, `security/…`, `docs/…`.
3. Make your changes. Keep them narrowly scoped.
4. Run `npm run build` and `npm run unit` — both must pass.
5. Open a PR against `master`.
6. CI will run on your PR. Fix anything red before requesting review.

## Commit style

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `security:`. Scope is optional.

## Licensing

By contributing, you agree your contribution is licensed under the **Apache License, Version 2.0** — the same license as the upstream project. Do not relicense, remove, or replace `LICENSE`, `NOTICE`, or the upstream attribution in the README. These are preserved verbatim per Apache-2.0 obligations.

## Syncing with upstream

```bash
git remote add upstream git@github.com:benweet/stackedit.git
git fetch upstream
git merge upstream/master
# Resolve conflicts, keeping fork-specific hardening intact.
```
