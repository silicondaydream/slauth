---
title: Security
description: What slauth protects against, how, and what it leaves to you.
---

slauth is small enough to read in one sitting, and you should feel free to. Here's what it does and doesn't do.

## What's covered

**No passwords, unless you turn them on.** Then: PBKDF2-SHA256 with a salt per password, nobody gets one without proving their email, 10 wrong guesses lock password sign-in for that email for 15 minutes, and unknown emails cost the same time as wrong passwords. See [Passwords](/docs/sign-in/passwords/).

**Email codes**
- 6 digits, uniformly random (rejection sampling over Web Crypto's random numbers).
- Only an HMAC-SHA256 of each code is stored, keyed with your `secret`.
- A code lasts 10 minutes and works once.
- 5 wrong tries and that code is dead (1 in 200,000 odds of guessing).
- A new code can be asked for once a minute per address.

**Sessions**
- Random 256-bit tokens; only their SHA-256 is stored.
- `HttpOnly`, `SameSite=Lax`, `Secure` on https.
- Signing out deletes the session in the store, not just the cookie.

**Passkeys**
- Full WebAuthn checks: the challenge (single use, 5 minutes), the origin, the rpId hash, user presence, and the signature (ES256 or RS256) over `authenticatorData ‖ SHA-256(clientDataJSON)`.
- Sign counters are tracked; a counter going backwards (a cloned key) is refused.
- Attestation isn't checked: slauth cares that the *same* passkey comes back, not who made it.

**Providers (OAuth / OpenID Connect)**
- PKCE (S256) on every flow; a random `state`, stored server-side, used once, and tied to the browser by an `HttpOnly` cookie (no login CSRF).
- Profiles come from the provider's API with the token just obtained over TLS.
- Accounts are matched by email **only** when the provider says it's verified, so nobody can claim your account with a provider account in your name.
- `redirect` only ever goes to a path on your site.

**Two-factor**
- TOTP codes accepted once each, ±30 seconds; 5 wrong codes and the sign-in starts over.
- Recovery codes are stored as SHA-256 and work once.

**Magic links** need a click on your page to sign in, so mail scanners that open links don't use them up. Using the link or the code spends both.

**Recent sign-in.** Adding a passkey or password, changing email, turning on two-factor, linking a provider and deleting the account need a session from the last 15 minutes, so a stolen session can't quietly add a way back in.

**Tokens** are ES256 JWTs lasting 5 minutes. The signing key is stored encrypted with a key derived from your `secret`.

**Cross-site requests (CSRF)**
- Every `POST` must be `application/json` (an HTML form can't send that), and must come from an allowed origin when the browser says where it came from.

**The allow list** is checked when a code is requested, when it's used, on every sign-in and on every request, so removing someone signs them out everywhere. [Banning](/docs/accounts/users/#banning) someone works the same way.

### Rate limits

- Per email: a new code once a minute, 5 tries per code, 10 wrong passwords per 15 minutes.
- Per IP, when your host says who's asking (`CF-Connecting-IP`, `Fly-Client-IP` or `X-Real-IP`): 10 code requests, 10 password sign-ups, 20 password sign-ins and 20 two-factor tries per 10 minutes. Adjust with [`rateLimit`](/docs/configuration/#ratelimit).

## What's left to you

- **Rate limiting by IP without a trusted header.** If your host doesn't set one of the headers above, slauth can't tell visitors apart, so add your platform's rate limiting for `/auth/*` (or pass `rateLimit.ip` if your proxy sets one you trust).
- **Revealing who's on the list.** With an `allow` list, asking for a code for an email that isn't on it says so (`not-allowed`). For a personal app that's friendlier than silence. If that matters for you, make `allow` always return `true` and check membership in your own routes instead.
- **Email deliverability.** Use a provider and a domain with SPF/DKIM set up.
- **Your secret.** Keep it in your platform's secrets, never in the repository.
- **HTTPS.** Cookies are only marked `Secure` on https, so serve your app over https (Workers, Vercel, Netlify and friends do).

## Reporting a problem

Please open a [private security advisory](https://github.com/silicondaydream/slauth/security/advisories/new) on GitHub rather than a public issue.
