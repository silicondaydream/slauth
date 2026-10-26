---
title: Security
description: What slauth protects against, how, and what it leaves to you.
---

slauth is small enough to read in one sitting, and you should feel free to. Here's what it does and doesn't do.

## What's covered

**No passwords.** Nothing to leak, reuse or reset.

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

**Cross-site requests (CSRF)**
- Every `POST` must be `application/json` (an HTML form can't send that), and must come from an allowed origin when the browser says where it came from.

**The allow list** is checked when a code is requested, when it's used, on passkey sign-in and on every request, so removing someone signs them out everywhere.

## What's left to you

- **Rate limiting by IP.** slauth limits per email address, not per IP. On Cloudflare, add a [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) for `/auth/email/start`; elsewhere, use your platform's equivalent.
- **Revealing who's on the list.** With an `allow` list, asking for a code for an email that isn't on it says so (`not-allowed`). For a personal app that's friendlier than silence. If that matters for you, make `allow` always return `true` and check membership in your own routes instead.
- **Email deliverability.** Use a provider and a domain with SPF/DKIM set up.
- **Your secret.** Keep it in your platform's secrets, never in the repository.
- **HTTPS.** Cookies are only marked `Secure` on https, so serve your app over https (Workers, Vercel, Netlify and friends do).

## Reporting a problem

Please open a [private security advisory](https://github.com/silicondaydream/slauth/security/advisories/new) on GitHub rather than a public issue.
