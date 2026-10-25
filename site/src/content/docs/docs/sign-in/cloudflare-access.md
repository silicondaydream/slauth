---
title: Cloudflare Access
description: Let Cloudflare Access sign people in, and use slauth for everything after.
---

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) (free for up to 50 people) can sit in front of your app: it shows its own login page, checks an email allow list, and passes every request through with a signed token.

slauth can read that token, so someone signed in by Access is signed in to your app too, as the same user they'd be with an email code:

```js
const auth = slauth({
  secret: env.SLAUTH_SECRET,
  store: d1(env.DB),
  access: { team: env.ACCESS_TEAM, aud: env.ACCESS_AUD },
})

const user = await auth.user(request) // works for Access sign-ins too
```

- **`team`**: your team name, the `yourteam` of `yourteam.cloudflareaccess.com`.
- **`aud`**: the Application Audience (AUD) tag of the Access application (or a list of them).

slauth verifies the token's RS256 signature against your team's public keys (fetched once and cached), plus its issuer, audience and expiry. It **never** trusts the plain `Cf-Access-Authenticated-User-Email` header, which anyone can set if they reach your Worker some other way.

## Setting up Access

1. **Zero Trust → Settings → Authentication**: add a login method (one-time PIN by email is on by default).
2. **Access → Applications → Add → Self-hosted**: add your app's hostname(s), set the session duration.
3. **Policy**: Allow, *Emails* = the people who should get in.
4. Copy the **AUD tag** and add `ACCESS_TEAM` and `ACCESS_AUD` as **Secrets** on your Worker.
5. Make sure every route to the Worker goes through Access, including `workers.dev` and preview URLs.

## Using only Access's pieces

The Access check and the PIN lock are also exported on their own, for apps that only want those:

```js
import { createAccess, createLock } from 'slauth'

const access = createAccess({ teamDomain: 'yourteam', audience: env.ACCESS_AUD })
const person = await access.getUser(request) // { email, userId } or null
```

See [A suite of apps](/docs/recipes/app-suite/) for how that fits together.
