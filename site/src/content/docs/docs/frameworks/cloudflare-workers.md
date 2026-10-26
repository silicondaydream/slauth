---
title: Cloudflare Workers
description: slauth on Workers with D1, served next to static assets.
---

The [quickstart](/docs/quickstart/) builds this from scratch. Here's the shape of a full app: a Worker with static assets, D1, Resend, and a protected API.

```jsonc title="wrangler.jsonc"
{
  "name": "my-app",
  "main": "src/worker.js",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": ["/auth/*", "/api/*"]
  },
  "d1_databases": [{ "binding": "DB", "database_name": "my-app" }]
}
```

```js title="src/worker.js"
import { slauth } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'
import { resend } from 'slauthjs/email/resend'

export default {
  async fetch(request, env) {
    const auth = slauth({
      secret: env.SLAUTH_SECRET,
      store: d1(env.DB),
      email: env.RESEND_API_KEY ? resend({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }) : undefined,
      appName: 'My App',
    })

    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/auth/')) return auth.handle(request)

    if (pathname.startsWith('/api/')) {
      const user = await auth.requireUser(request)
      if (user instanceof Response) return user
      // ... your API, scoped to user.id
    }

    return env.ASSETS.fetch(request)
  },
}
```

Creating `slauth()` per request is cheap: it only builds a few closures.

```sh
npx wrangler secret put SLAUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

A complete version lives in [`examples/workers-d1`](https://github.com/silicondaydream/slauth/tree/main/examples/workers-d1).

:::caution
Add `SLAUTH_SECRET` and friends as **Secrets**. Plain variables set in the dashboard are replaced by the next `wrangler deploy`.
:::
