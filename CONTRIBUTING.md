# Contributing

Before you start: [CODE_POLICY.md](CODE_POLICY.md) has the rules (zero dependencies, the
security checklist, compatibility, docs in the same PR). Found a vulnerability? See
[SECURITY.md](SECURITY.md), not the issue tracker.

## The library

```sh
pnpm install
pnpm test        # vitest: every flow, every store, real passkey crypto
pnpm typecheck   # tsc over the public .d.ts files and test/types.ts
```

`src/` is plain ESM JavaScript with hand-written `.d.ts` files next to it. Keep it
dependency-free and Web-standard (`fetch`, `Request`/`Response`, Web Crypto), so it keeps
running on Workers, Bun, Deno and Node.

### Browser test

`test/e2e-browser.mjs` drives `<slauth-sign-in>` in Chromium against `examples/workers-d1`,
with Chrome's virtual passkey authenticator: email code → add passkey → sign out → passkey
sign-in.

```sh
cd examples/workers-d1 && npm install && cp .dev.vars.example .dev.vars
npm run dev > dev.log &            # wait for it to start
cd ../.. && node test/e2e-browser.mjs examples/workers-d1/dev.log   # needs playwright
```

## The docs (slauth.dev)

The site and docs live in a separate, private repository, so a library change and its
docs land as two PRs. Say in yours which options, routes, error codes or storage keys
changed and a maintainer will update the docs before the release. Docs mistakes are
welcome as issues here.

## Releases

slauth ships a minor release on the first Tuesday of each month, and patches only for
security fixes and serious regressions. [RELEASING.md](RELEASING.md) has the schedule and
the steps; publishing is done by CI from a version tag, never by hand. The package is
**`slauthjs`** on npm (`slauth` was taken); the library and the site are still called slauth.

When you open a PR, add a line under `## Unreleased` in `CHANGELOG.md`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the tests and type check on
Node 22 and 24, a no-install smoke test on Node 20, a package-contents check, and
[zizmor](https://docs.zizmor.sh) over the workflows themselves. Actions are pinned to
commit SHAs; Dependabot updates them weekly. To run the smoke test yourself:
`pnpm smoke`.
