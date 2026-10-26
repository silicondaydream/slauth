---
title: Errors
description: Every error code slauth answers with.
---

Errors are JSON: `{ "error": "A sentence for people.", "code": "for-your-code", ...details }`. In the browser, `createClient()` throws them as `SlauthError` with the same `code`.

| Code | Status | When | Details |
|---|---|---|---|
| `bad-email` | 400 | That isn't an email address | |
| `not-allowed` | 403 | Not on the `allow` list | |
| `slow-down` | 429 | A new code within a minute, or the per-IP limit | `retryAfter` (seconds) |
| `bad-code` | 400 | Wrong code | `triesLeft` |
| `too-many-tries` | 410 / 429 | 5 wrong tries on this code (410), or 10 wrong passwords (429) | |
| `expired` | 410 | No code (or link, or two-factor sign-in), or too old, or already used | |
| `banned` | 403 | That user is [banned](/docs/accounts/users/#banning) | |
| `bad-password` | 400 | Wrong email and password, or wrong current password | |
| `weak-password` | 400 | Too short, or your `validate` said no | |
| `reauth-required` | 403 | Needs a [recent sign-in](/docs/accounts/sessions/#recent-sign-in) | |
| `forbidden` | 403 | `requireUser` with a role they don't have; an org action their role can't do | |
| `email-taken` | 409 | Changing to an email another account uses | |
| `same-email` | 400 | Changing to the email you already have | |
| `two-factor-on` | 409 | Setting up two-factor when it's already on | |
| `last-owner` | 409 | An organization would be left without an owner | |
| `already-member` | 409 | Inviting someone who's already in the organization | |
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

Provider sign-ins are redirects, so their errors come back as `?slauth_error=<code>` on your page: `oauth-cancelled`, `oauth-failed`, `oauth-state`, `email-not-verified`, `not-allowed`, `account-in-use`, `banned`, `signed-out`, `reauth-required`. See [providers](/docs/sign-in/providers/#when-something-goes-wrong).

The [app lock](/docs/sign-in/app-lock/) routes answer with a `reason` instead: `no-pin` (409), `wrong` (401, with `attemptsLeft`) and `locked` (429, with `retryAt`).
