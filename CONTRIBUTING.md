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

## Publishing to npm

1. The package is published as **`slauthjs`** (`slauth` was taken on npm). The library
   and the site are still called slauth.
2. Bump `version` in `package.json`, add a CHANGELOG entry, and merge that to `main`.
3. Tag it: `git tag v2.0.1 && git push origin v2.0.1`. The
   [Release workflow](.github/workflows/release.yml) checks the tag matches the version,
   runs everything again, and publishes with npm trusted publishing after a reviewer
   approves the `npm` environment. Nobody publishes from a laptop.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the tests and type check on
Node 22 and 24, a no-install smoke test on Node 20, a package-contents check, and
[zizmor](https://docs.zizmor.sh) over the workflows themselves. Actions are pinned to
commit SHAs; Dependabot updates them weekly. To run the smoke test yourself:
`pnpm smoke`.
