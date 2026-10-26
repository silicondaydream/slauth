---
title: Hono
description: slauth in a Hono app, with a middleware for protected routes.
---

```js
import { Hono } from 'hono'
import { slauth } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'

const app = new Hono()

const authFor = (env) => slauth({ secret: env.SLAUTH_SECRET, store: d1(env.DB) })

app.all('/auth/*', (c) => authFor(c.env).handle(c.req.raw))

// Protect everything under /api.
app.use('/api/*', async (c, next) => {
  const user = await authFor(c.env).requireUser(c.req.raw)
  if (user instanceof Response) return user
  c.set('user', user)
  await next()
})

app.get('/api/me', (c) => c.json({ hello: c.get('user').email }))

export default app
```

On Bun or Node, build `auth` once at the top instead of per request, with the [SQLite store](/docs/stores/#sqlite).
