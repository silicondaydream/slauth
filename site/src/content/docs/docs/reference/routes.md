---
title: Routes
description: Every route auth.handle() answers.
---

All under `basePath` (default `/auth`). `POST`s need `Content-Type: application/json` and, when the browser sends an `Origin`, one of the allowed origins. "Signed in" routes answer `401 signed-out` otherwise; ⏱ marks ones that need a [recent sign-in](/docs/accounts/sessions/#recent-sign-in).

Sign-in routes answer `{ user }` with a session cookie, or `{ twoFactor: true }` when a [two-factor](/docs/sign-in/two-factor/) code is next. With `X-Slauth-Transport: bearer` they answer with `token` (or `pendingToken`) in the body instead of a cookie.

## Always on

| Method | Route | Body | Answer |
|---|---|---|---|
| GET | `session` | | `{ user, twoFactor?, impersonatorId?, lock? }`; renews the cookie once a day |
| GET | `config` | | what's turned on, and the providers (for sign-in screens) |
| POST | `email/start` | `{ email, redirect? }` | `{ ok: true }` |
| POST | `email/verify` | `{ email, code }` | sign-in |
| POST | `signout` | `{}` | `{ ok: true }` + cleared cookie |
| POST | `passkey/login/options` | `{}` | WebAuthn request options |
| POST | `passkey/login/verify` | `{ credential }` | sign-in |

## Your account (signed in)

| Method | Route | Body | Answer |
|---|---|---|---|
| POST | `user` | `{ name?, image? }` | `{ user }` |
| POST | `user/delete` ⏱ | `{}` | `{ ok: true }` |
| POST | `email/change/start` ⏱ | `{ email }` | `{ ok: true }` (code sent to the new address) |
| POST | `email/change/verify` | `{ email, code }` | `{ user }` |
| GET | `sessions` | | `{ sessions: [...] }` |
| POST | `sessions/revoke` | `{ id }` | `{ ok: true }` |
| POST | `sessions/revoke-others` | `{}` | `{ ok: true }` |
| GET | `accounts` | | `{ accounts, password, twoFactor }` |
| POST | `accounts/unlink` | `{ provider }` | `{ ok: true }` |
| POST | `passkey/register/options` ⏱ | `{}` | WebAuthn creation options |
| POST | `passkey/register/verify` | `{ credential, name? }` | `{ ok, passkey }` |
| GET | `passkeys` | | `{ passkeys: [...] }` |
| POST | `passkey/rename` | `{ id, name }` | `{ ok: true }` |
| POST | `passkey/delete` | `{ id }` | `{ ok: true }` |

## Providers (`providers`)

| Method | Route | |
|---|---|---|
| GET | `oauth/<id>?redirect=/path` | start signing in |
| GET | `oauth/<id>?link=1&redirect=/path` ⏱ | link to the signed-in account |
| GET | `oauth/<id>/callback` | where the provider sends people back |

## Magic links (`magicLinks`)

| Method | Route | Body | Answer |
|---|---|---|---|
| GET | `email/link?token=…` | | a page with a Continue button |
| POST | `email/link` | `{ token }` | sign-in, plus `redirect` |

## Passwords (`passwords`)

| Method | Route | Body | Answer |
|---|---|---|---|
| POST | `password/signin` | `{ email, password }` | sign-in |
| POST | `password/signup` | `{ email, password, redirect? }` | `{ ok, verify: 'email' }`; then `email/verify` |
| POST | `password/set` ⏱ | `{ password, current? }` | `{ ok: true }` (`current` instead of a recent sign-in) |
| POST | `password/remove` ⏱ | `{}` | `{ ok: true }` |

## Two-factor (`twoFactor`)

| Method | Route | Body | Answer |
|---|---|---|---|
| POST | `two-factor/verify` | `{ code }` or `{ recoveryCode }`, `pendingToken?` | sign-in |
| POST | `two-factor/setup` ⏱ | `{}` | `{ secret, uri }` |
| POST | `two-factor/enable` | `{ code }` | `{ ok, recoveryCodes }` |
| POST | `two-factor/disable` | `{ code }` or `{ recoveryCode }` | `{ ok: true }` |
| POST | `two-factor/recovery-codes` | `{ code }` | `{ ok, recoveryCodes }` |

## Tokens (`tokens`)

| Method | Route | Answer |
|---|---|---|
| GET | `token` | `{ token, expiresAt }` (signed in) |
| GET | `jwks.json` | `{ keys: [...] }` (public, cacheable) |

## Organizations (`organizations`, signed in)

| Method | Route | Body | Who |
|---|---|---|---|
| GET | `orgs` | | anyone: my orgs |
| POST | `orgs` | `{ name }` | per `allowCreate` |
| GET | `orgs/<id>` | | members |
| POST | `orgs/<id>` | `{ name }` | owner, admin |
| POST | `orgs/<id>/delete` | `{}` | owner |
| POST | `orgs/<id>/invite` | `{ email, role? }` | owner, admin |
| POST | `orgs/<id>/invites/revoke` | `{ id }` | owner, admin |
| POST | `orgs/<id>/members/role` | `{ userId, role }` | owner, admin |
| POST | `orgs/<id>/members/remove` | `{ userId }` | owner, admin, or yourself |
| GET | `invites` | | anyone: addressed to me |
| POST | `invites/accept` | `{ id }` | the invitee |
| POST | `invites/decline` | `{ id }` | the invitee |

## App lock (`lock`, signed in)

| Method | Route | Body |
|---|---|---|
| GET | `lock/session` | |
| POST | `lock/setup` | `{ pin, policy? }` or `{ policy: 'never' }` |
| POST | `lock/login` | `{ pin }` |
| POST | `lock/logout` | `{}` |
| POST | `lock/pin` | `{ current, next }` |
| POST | `lock/policy` | `{ policy, pin }` |

`credential` is the `PublicKeyCredential` from the browser as JSON with base64url fields (what `credential.toJSON()` returns). The [client helpers](/docs/client/helpers/) handle that for you.
