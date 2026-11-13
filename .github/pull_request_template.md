## What and why

<!-- What changed, and the problem it solves. Link the issue if there is one. -->

## How it was tested

<!-- Tests added or changed; for <slauth-sign-in> or <slauth-account>, how you tried it in a browser. -->

## Checklist ([CODE_POLICY.md](../blob/main/CODE_POLICY.md))

- [ ] Off by default, on with one config key (or it's a fix)
- [ ] No runtime dependencies; Web standards only in `src/`
- [ ] Tests for the failure paths, not just the happy path
- [ ] `.d.ts` files updated; `CHANGELOG.md` has an entry under `## Unreleased`
- [ ] Docs: what users will notice (options, routes, error codes, storage keys) is listed below, or there's a linked slauth-site PR
- [ ] Nothing a user can notice breaks (or this is for a major release, with an "Upgrading" note)

## Security-sensitive files

<!-- If this touches src/core.js, session.js, tokens.js, password.js, two-factor.js, email-code.js,
     util.js, access.js, lock.js, oauth/, passkey/ or routes/: a short threat note.
     What could an attacker try, and what stops them? Delete this section otherwise. -->

## For the docs

<!-- New or changed options, routes, error codes, storage keys. "None" is fine. -->
