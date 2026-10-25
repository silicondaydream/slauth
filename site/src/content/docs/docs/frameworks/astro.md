---
title: Astro
description: slauth in Astro with an API route and middleware.
---

Astro needs server output for this (any adapter: Cloudflare, Node, Vercel, Netlify).

```ts title="src/lib/auth.ts"
import { slauth } from 'slauth'
import { sqlite } from 'slauth/stores/sqlite'
import { DatabaseSync } from 'node:sqlite'

export const auth = slauth({
  secret: import.meta.env.SLAUTH_SECRET,
  store: sqlite(new DatabaseSync('app.db')),
  appName: 'My Astro App',
})
```

On Cloudflare, read bindings with `import { env } from 'cloudflare:workers'` and use `d1(env.DB)` instead.

```ts title="src/pages/auth/[...all].ts"
import type { APIRoute } from 'astro'
import { auth } from '../../lib/auth'

export const prerender = false
export const ALL: APIRoute = ({ request }) => auth.handle(request)
```

```ts title="src/middleware.ts"
import { defineMiddleware } from 'astro:middleware'
import { auth } from './lib/auth'

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = await auth.user(context.request)
  if (context.url.pathname.startsWith('/app') && !context.locals.user) return context.redirect('/sign-in')
  return next()
})
```

```astro title="src/pages/sign-in.astro"
---
export const prerender = false
---
<slauth-sign-in app-name="My Astro App" redirect="/app"></slauth-sign-in>
<script>import 'slauth/element'</script>
```

Add `user` to `App.Locals` in `src/env.d.ts` to type it:

```ts
declare namespace App {
  interface Locals { user: import('slauth').SlauthUser | null }
}
```
