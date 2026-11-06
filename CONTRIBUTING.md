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

## The site (slauth.dev)

The site needs Node 22.23 or newer (Astro's requirement); CI builds it on Node 24.

```sh
cd site
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # static output in dist/
pnpm run deploy   # wrangler deploy → the slauth-site Worker
```

The whole repo uses pnpm (the library and the site each have their own `pnpm-lock.yaml`).
On Cloudflare Workers Builds, set the root directory to `site`, the build command to
`pnpm run build` and the deploy command to `npx wrangler deploy`.

Marketing pages are in `site/src/pages`, docs in `site/src/content/docs/docs` (Markdown,
Starlight). When you change the library, change the docs in the same PR.

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
Node 22 and 24, a no-install smoke test on Node 20, the site build with a link check, and
[zizmor](https://docs.zizmor.sh) over the workflows themselves. Actions are pinned to
commit SHAs; Dependabot updates them weekly. To run the smoke test yourself:
`pnpm smoke`.
