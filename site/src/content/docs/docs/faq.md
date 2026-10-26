---
title: FAQ
description: Questions people ask about slauth.
---

### Why not just use Auth.js or Clerk?

Use them if you need what they do: lots of OAuth providers (Auth.js) or orgs, admin dashboards and compliance (Clerk). slauth is for when you want sign-in done in five minutes, in your own database, with nothing to configure. See [the comparison](/compare).

### Can I add "Sign in with Google"?

Not yet. It's the most-asked-for feature and on the list. Meanwhile, [Cloudflare Access](/docs/sign-in/cloudflare-access/) can do Google login in front of your app, and slauth reads it.

### Do I need passwords?

No, and you can't have them. That's the point.

### What happens if someone loses their phone?

They sign in with an email code, then remove the old passkey from your settings page (`auth.passkey.remove(id)`).

### Can people change their email?

Not built in yet. You can move them yourself: `put` the user with the new email, add `email:<new>` and delete `email:<old>`.

### Is it production-ready?

For personal projects and small apps, yes: it's tested end to end, including real passkeys in Chrome. It hasn't had an independent security audit. Read [Security](/docs/concepts/security/) for what it covers.

### Why "slauth"?

Sloth + auth. The sloth is slow so your login doesn't have to be. 🦥
