---
title: Bun
description: slauth with Bun.serve and bun:sqlite.
---

```js title="server.js"
import { Database } from 'bun:sqlite'
import { slauth } from 'slauth'
import { sqlite } from 'slauth/stores/sqlite'

const auth = slauth({
  secret: process.env.SLAUTH_SECRET,
  store: sqlite(new Database('app.db')),
  appName: 'My Bun App',
})

Bun.serve({
  port: 3000,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/auth/')) return auth.handle(request)

    if (pathname === '/api/me') {
      const user = await auth.requireUser(request)
      if (user instanceof Response) return user
      return Response.json({ hello: user.email })
    }
    return new Response('Hello!')
  },
})
```

```sh
SLAUTH_SECRET=$(openssl rand -base64 32) bun run server.js
```

See [`examples/bun-sqlite`](https://github.com/silicondaydream/slauth/tree/main/examples/bun-sqlite).
