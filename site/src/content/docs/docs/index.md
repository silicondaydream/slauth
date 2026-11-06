---
title: Introduction
description: slauth is open-source auth you own. Email codes and passkeys in five minutes; providers, passwords, two-factor, organizations and JWTs when you need them.
---

**slauth** (sloth + auth, say it slowly) adds sign-in to a project in about five minutes, and grows with it:

- **Email codes**: people type their email, get a 6-digit code, type it in. No passwords anywhere.
- **Passkeys**: after that, one tap to add Face ID / Touch ID / a security key, and signing in is instant.
- **Your database**: users, sessions and passkeys live in D1, SQLite, Workers KV, or anything with `get`/`put`/`delete`.
- **Runs anywhere** that speaks `Request`/`Response`: Cloudflare Workers, Bun, Deno, Node, Next.js, Astro, Hono.
- **Zero dependencies**: plain JavaScript and Web Crypto, with TypeScript types. Small enough to read.

And when the project grows, each of these is one config key:

- [**Sign in with GitHub, Google, Discord, Microsoft**](/docs/sign-in/providers/), or any OpenID Connect provider.
- [**Passwords**](/docs/sign-in/passwords/), [**magic links**](/docs/sign-in/magic-links/) and [**two-factor**](/docs/sign-in/two-factor/) with recovery codes.
- [**Sessions and devices**](/docs/accounts/sessions/), [**roles, metadata and an admin API**](/docs/accounts/users/) with bans and impersonation.
- [**Organizations**](/docs/accounts/organizations/) with roles and email invitations.
- [**JWTs**](/docs/accounts/tokens/) your other services check against `/auth/jwks.json`.
- [**`<slauth-account>`**](/docs/client/account-element/): a whole account page in one tag.

```js
import { slauth } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'

const auth = slauth({ secret: env.SLAUTH_SECRET, store: d1(env.DB) })

if (url.pathname.startsWith('/auth/')) return auth.handle(request)
const user = await auth.user(request) // { id, email, name, roles, … } or null
```

On the page, drop in the sign-in box:

```html
<script type="module">import 'slauthjs/element'</script>
<slauth-sign-in app-name="My App" redirect="/"></slauth-sign-in>
```

## Is it for me?

slauth starts with **your** projects: prototypes, hackathon apps, tools for you, your family and friends. It's sturdier than a password in an environment variable and much less fuss than a hosted auth company.

It keeps going for products that should own their users' data: the things you'd reach for Auth.js or Clerk for (providers, two-factor, organizations, an admin API) without a bill per user or a second place your users live.

It doesn't do SAML, SCIM or per-organization SSO. If you need those, see [the comparison](/compare).

## Where next

- [Quickstart](/docs/quickstart/): a working sign-in on Cloudflare Workers in five minutes.
- [How it works](/docs/concepts/how-it-works/): users, sessions and stores in two minutes of reading.
- [Frameworks](/docs/frameworks/cloudflare-workers/): Workers, Hono, Astro, Next.js, Bun, Deno, Node.
