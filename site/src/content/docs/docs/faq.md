---
title: FAQ
description: Questions people ask about slauth.
---

### Why not just use Auth.js or Clerk?

Use them if you need what they do: dozens of ready-made OAuth providers (Auth.js), or a hosted dashboard, SAML and compliance paperwork (Clerk). slauth gives you sign-in in five minutes, in your own database, and the deeper features (providers, two-factor, organizations, JWTs) when you turn them on. See [the comparison](/compare).

### Can I add "Sign in with Google"?

Yes: GitHub, Google, Discord, GitLab and Microsoft are built in, and any OpenID Connect or OAuth 2.0 provider takes a few lines. See [Sign in with GitHub, Google & co.](/docs/sign-in/providers/)

### Do I need passwords?

No. But you can turn them on, for people who want them: see [Passwords](/docs/sign-in/passwords/). Nobody gets one without proving their email first.

### What happens if someone loses their phone?

They sign in with an email code, then remove the old passkey from your settings page (`auth.passkey.remove(id)`, or [`<slauth-account>`](/docs/client/account-element/)). With two-factor on, they use a recovery code.

### Can people change their email?

Yes: they confirm the new address with a code (`auth.email.change.start` / `verify`), or you do it with `auth.users.update(id, { email })`.

### Is it production-ready?

It's tested end to end, including real passkey crypto, PKCE round trips and the RFC's TOTP test vectors. It hasn't had an independent security audit. Read [Security](/docs/concepts/security/) for what it covers.

### Why "slauth"?

Sloth + auth. The sloth is slow so your login doesn't have to be. 🦥
