---
title: Routes
description: Every route auth.handle() answers.
---

All under `basePath` (default `/auth`). `POST`s need `Content-Type: application/json` and, when the browser sends an `Origin`, one of the allowed origins.

| Method | Route | Body | Answer |
|---|---|---|---|
| GET | `session` | | `{ user, lock? }`; renews the cookie once a day |
| POST | `email/start` | `{ email }` | `{ ok: true }` |
| POST | `email/verify` | `{ email, code }` | `{ user }` + session cookie |
| POST | `signout` | `{}` | `{ ok: true }` + cleared cookie |
| POST | `passkey/login/options` | `{}` | WebAuthn request options |
| POST | `passkey/login/verify` | `{ credential }` | `{ user }` + session cookie |
| POST | `passkey/register/options` | `{}` | WebAuthn creation options (signed in) |
| POST | `passkey/register/verify` | `{ credential, name? }` | `{ ok, passkey }` (signed in) |
| GET | `passkeys` | | `{ passkeys: [...] }` (signed in) |
| POST | `passkey/delete` | `{ id }` | `{ ok: true }` (signed in) |

With `lock` on, also (signed in):

| Method | Route | Body |
|---|---|---|
| GET | `lock/session` | |
| POST | `lock/setup` | `{ pin, policy? }` or `{ policy: 'never' }` |
| POST | `lock/login` | `{ pin }` |
| POST | `lock/logout` | `{}` |
| POST | `lock/pin` | `{ current, next }` |
| POST | `lock/policy` | `{ policy, pin }` |

`credential` is the `PublicKeyCredential` from the browser as JSON with base64url fields (what `credential.toJSON()` returns). The [client helpers](/docs/client/helpers/) handle that for you.
