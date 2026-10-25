---
title: Node and Express
description: slauth on plain Node or Express, with toNodeHandler.
---

Node's `http` module doesn't use `Request`/`Response`, so slauth includes a small adapter.

```js title="server.js"
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { slauth } from 'slauth'
import { sqlite } from 'slauth/stores/sqlite'
import { toNodeHandler, toRequest } from 'slauth/node'

const auth = slauth({
  secret: process.env.SLAUTH_SECRET,
  store: sqlite(new DatabaseSync('app.db')),
  appName: 'My Express App',
})

const app = express()
app.use('/auth', toNodeHandler(auth))

app.get('/api/me', async (req, res) => {
  const user = await auth.user(await toRequest(req))
  if (!user) return res.status(401).json({ error: 'Please sign in.' })
  res.json({ hello: user.email })
})

app.listen(3000)
```

- `toNodeHandler(auth)` works with `app.use('/auth', …)` (it reads `req.originalUrl`), plain `http.createServer`, and Connect-style middleware.
- `toRequest(req)` turns a Node request into a `Request` for `auth.user()`/`auth.requireUser()`. It reads `X-Forwarded-Proto`/`Host`, so cookies are `Secure` behind a proxy that sets them.
- If `express.json()` already read the body, `toRequest` uses `req.body`.

See [`examples/node-express`](https://github.com/silicondaydream/slauth/tree/main/examples/node-express).
