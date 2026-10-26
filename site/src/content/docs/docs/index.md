---
title: Introduction
description: slauth is sign-in for side projects. Email codes and passkeys, your own database, zero dependencies.
---

**slauth** (sloth + auth, say it slowly) adds sign-in to a side project in about five minutes:

- **Email codes**: people type their email, get a 6-digit code, type it in. No passwords anywhere.
- **Passkeys**: after that, one tap to add Face ID / Touch ID / a security key, and signing in is instant.
- **Your database**: users, sessions and passkeys live in D1, SQLite, Workers KV, or anything with `get`/`put`/`delete`.
- **Runs anywhere** that speaks `Request`/`Response`: Cloudflare Workers, Bun, Deno, Node, Next.js, Astro, Hono.
- **Zero dependencies**: about 29 kB of plain JavaScript with TypeScript types.

```js
import { slauth } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'

const auth = slauth({ secret: env.SLAUTH_SECRET, store: d1(env.DB) })

if (url.pathname.startsWith('/auth/')) return auth.handle(request)
const user = await auth.user(request) // { id, email, createdAt } or null
```

On the page, drop in the sign-in box:

```html
<script type="module">import 'slauthjs/element'</script>
<slauth-sign-in app-name="My App" redirect="/"></slauth-sign-in>
```

## Is it for me?

slauth is for **your** projects: prototypes, hackathon apps, tools for you, your family and friends, small products that should own their users' data. It's sturdier than a password in an environment variable and much less fuss than a hosted auth company.

It deliberately **doesn't** do enterprise things: SAML, SCIM, orgs and roles, or "sign in with 40 providers". If you need those, see [the comparison](/compare).

## Where next

- [Quickstart](/docs/quickstart/): a working sign-in on Cloudflare Workers in five minutes.
- [How it works](/docs/concepts/how-it-works/): users, sessions and stores in two minutes of reading.
- [Frameworks](/docs/frameworks/cloudflare-workers/): Workers, Hono, Astro, Next.js, Bun, Deno, Node.
