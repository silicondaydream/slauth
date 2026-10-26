---
title: Deno
description: slauth with Deno.serve and Deno KV.
---

```js title="main.js"
import { slauth } from 'npm:slauthjs'

const kv = await Deno.openKv()
const store = {
  get: async (key) => (await kv.get(['slauth', key])).value ?? null,
  put: (key, value, { ttl } = {}) => kv.set(['slauth', key], value, ttl ? { expireIn: ttl * 1000 } : undefined),
  delete: (key) => kv.delete(['slauth', key]),
}

const auth = slauth({ secret: Deno.env.get('SLAUTH_SECRET'), store, appName: 'My Deno App' })

Deno.serve(async (request) => {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/auth/')) return auth.handle(request)

  const user = await auth.user(request)
  return new Response(user ? `Hi ${user.email}` : 'Signed out')
})
```

```sh
SLAUTH_SECRET=$(openssl rand -base64 32) deno run --allow-net --allow-env --unstable-kv main.js
```

That inline store is the whole Deno KV adapter. See [Write your own store](/docs/stores/#write-your-own).
