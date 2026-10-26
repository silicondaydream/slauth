---
title: Errors
description: Every error code slauth answers with.
---

Errors are JSON: `{ "error": "A sentence for people.", "code": "for-your-code", ...details }`. In the browser, `createClient()` throws them as `SlauthError` with the same `code`.

| Code | Status | When | Details |
|---|---|---|---|
| `bad-email` | 400 | That isn't an email address | |
| `not-allowed` | 403 | Not on the `allow` list | |
| `slow-down` | 429 | A new code within a minute | `retryAfter` (seconds) |
| `bad-code` | 400 | Wrong code | `triesLeft` |
| `too-many-tries` | 410 | 5 wrong tries on this code | |
| `expired` | 410 | No code, or older than 10 minutes, or already used | |
| `signed-out` | 401 | Needs a signed-in person | |
| `locked` | 401 | Signed in, but the app lock wants the PIN | |
| `passkey-failed` | 400 | A passkey check failed (the `error` says which) | |
| `passkey-unknown` | 400 / 404 | That passkey isn't registered here | |
| `passkey-exists` | 409 | Registering the same passkey twice | |
| `cross-site` | 403 | `POST` from another origin | |
| `bad-request` | 415 | `POST` that isn't JSON | |
| `not-found` | 404 | No such route | |
| `server-error` | 500 | Something broke (logged on the server) | |
| `offline` | 0 | Client only: couldn't reach the server | |

The [app lock](/docs/sign-in/app-lock/) routes answer with a `reason` instead: `no-pin` (409), `wrong` (401, with `attemptsLeft`) and `locked` (429, with `retryAt`).
