# Code policy

How code gets into slauth. It's an auth library, so the bar is higher than "it works on
my machine": people trust it with their users. [CONTRIBUTING.md](CONTRIBUTING.md) covers the
mechanics (commands, the site, publishing); this covers the rules.

## 1. The ethos is a requirement

- **Five minutes stays five minutes.** `slauth({ secret, store })` must keep working with
  nothing else. A new feature is **off by default** and turns on with **one config key**.
  The only exceptions are security fixes, and those go in the CHANGELOG.
- **Depth is opt-in, not in the way.** If a feature makes the simple path longer, slower
  or harder to read, it needs a different design.
- **Say no to scope that isn't auth.** Billing, analytics, feature flags and CRM belong
  elsewhere. When unsure, open an issue before the code.

## 2. Dependencies and platforms

- **Zero runtime dependencies.** `dependencies` in the root `package.json` stays empty.
  Dev dependencies need a reason in the PR.
- **Web standards only** in `src/`: `fetch`, `Request`/`Response`, Web Crypto, `TextEncoder`.
  No Node built-ins outside `src/node.js`. Everything must run on Workers, Bun, Deno and
  Node 20+ unchanged.
- **No home-made cryptography.** Use Web Crypto's primitives (HMAC, SHA-256, PBKDF2,
  ECDSA, AES-GCM). Formats and protocols (WebAuthn, TOTP, JWT, OAuth) follow their RFCs and
  cite them in a comment.

## 3. Security rules

These hold for every change. Reviewers check them by name.

1. **Store hashes, not secrets.** Session tokens, codes, links and recovery codes are
   stored as SHA-256 or HMAC. Anything that must be readable later (TOTP secrets, signing
   keys) is called out in the docs' storage-keys page.
2. **Compare secrets in constant time** (`safeEqual`).
3. **Never log** tokens, codes, passwords, secrets, cookies or full emails, not even
   in errors.
4. **Every guessable thing is limited**: tries per code, failures per email, per-IP limits.
   New guessable inputs get a limit and a test that hits it.
5. **Single use means single use.** Challenges, states, codes and links are deleted
   *before* they're checked, or in the same step.
6. **Redirects stay on-site** (`safeRedirect`). **Cookies** are `HttpOnly`, `SameSite=Lax`,
   `Secure` on https.
7. **Writes are CSRF-safe**: JSON-only and origin-checked. A route that can't be (a
   provider callback) is a GET with its own state check.
8. **Identity is matched by email only when the email is verified.**
9. **Changes that add a way back into an account** (passkey, password, provider, email,
   two-factor) need a recent sign-in.
10. **Errors are boring**: a stable kebab-case `code`, a human `error`, and no internals.

### Security-sensitive files

`src/core.js`, `src/session.js`, `src/tokens.js`, `src/password.js`, `src/two-factor.js`,
`src/email-code.js`, `src/util.js`, `src/oauth/`, `src/passkey/`, `src/routes/`, `src/access.js`
and `src/lock.js`.

A change to any of these needs:

- a short **threat note** in the PR: what an attacker could try, and what stops them;
- **tests for the failure paths**, not only the happy path;
- for a security fix, a test that **fails without the fix** (say in the PR that you
  checked);
- review from a code owner (see `.github/CODEOWNERS`).

Vulnerabilities are reported privately: see [SECURITY.md](SECURITY.md).

## 4. Tests

- `pnpm test` and `pnpm typecheck` pass on every commit to `main`. CI enforces it.
- Every route and flow has tests through `auth.handle()`, the way a browser would use it
  (`test/helpers.js`). Stores run the shared contract tests.
- Changes to `<slauth-sign-in>` or `<slauth-account>` are tried in a real browser
  (`test/e2e-browser.mjs`, or a Playwright script in the PR description).
- Never skip, disable or loosen a test to get green. Fix the code or the test's mistake.

## 5. Compatibility

- **Semver.** Anything a user can notice, breaking it, is a major version: exports, config,
  routes, response shapes, error codes, cookie names, events.
- **Storage keys are API.** New code must read what old versions wrote (see how 1.x users
  and sessions are read in 2.x). No migrations that users have to run.
- A breaking change ships with an **"Upgrading" section in CHANGELOG.md** and, where
  possible, a config switch back to the old behaviour for one major version.
- Deprecate before removing: a `console.warn` once, a CHANGELOG entry, then removal in the
  next major.

## 6. Docs

- **Docs change in the same PR as the code.** New options go on the Configuration page,
  new routes on Routes, new error codes on Errors, new keys on Storage keys.
- Docs are written for someone in a hurry: the code first, then why.
- The `.d.ts` files are hand-written and are part of the docs; keep them in step.

## 7. Style

- Plain ESM JavaScript with JSDoc where it helps, and hand-written `.d.ts` next to each
  public module.
- Match the surrounding code: names, comment density, small functions, early returns.
- Comments say **why**, not what. Storage layouts go in the module's header comment.
- One module per concern. If a file passes about 300 lines, it's probably two things.

## 8. Changes and reviews

- Small, focused PRs with a description of what changed, why, and how it was tested.
- `main` is protected: changes land by PR with green CI and a review. No force-pushes.
- Commits say what changed and why. Squash or merge commits are both fine; no history
  rewriting on shared branches.
- **AI-assisted contributions are welcome** at the same bar as any other: the person opening
  the PR owns it, has read every line, and has run the tests. Don't paste model output
  you haven't checked into security-sensitive files.

## 9. Releases and the supply chain

- Releases are **published by CI from a version tag**, never from a laptop, with npm
  provenance where the repository allows it. See `.github/workflows/release.yml`.
- CI actions are **pinned to full commit SHAs**, workflows get **least-privilege
  `permissions`**, and Dependabot keeps both pins and dev dependencies current.
- No long-lived npm tokens: publishing uses npm's trusted publishing (OIDC).
- Never commit secrets. `.dev.vars` and `.env*` stay ignored.
