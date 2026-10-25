---
title: Quickstart
description: Sign-in on Cloudflare Workers with D1 in five minutes.
---

This builds a Worker with email-code sign-in, passkeys and a protected `/api/me` route. Using something else? The [framework guides](/docs/frameworks/hono/) show the same thing for each one; the slauth part is identical.

## 1. Install

```sh
npm create cloudflare@latest my-app -- --type hello-world
cd my-app
npm install slauth
```

## 2. Add a database and a secret

In `wrangler.jsonc`, add a D1 database (wrangler creates it on the first deploy):

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "my-app" }]
```

Make a secret for local development in `.dev.vars`:

```sh
echo "SLAUTH_SECRET=$(openssl rand -base64 32)" > .dev.vars
```

## 3. Mount slauth

```js title="src/index.js"
import { slauth } from 'slauth'
import { d1 } from 'slauth/stores/d1'

export default {
  async fetch(request, env) {
    const auth = slauth({
      secret: env.SLAUTH_SECRET,
      store: d1(env.DB),
      appName: 'My App',
    })

    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/auth/')) return auth.handle(request)

    if (pathname === '/api/me') {
      const user = await auth.requireUser(request)
      if (user instanceof Response) return user // 401 when signed out
      return Response.json({ hello: user.email })
    }

    return new Response('Hello!')
  },
}
```

## 4. Try it

```sh
npx wrangler dev
```

```sh
curl -X POST localhost:8787/auth/email/start \
  -H 'content-type: application/json' -d '{"email":"you@example.com"}'
```

No email provider yet, so the code is printed in the `wrangler dev` terminal:

```
  🦥 slauth: My App sign-in code for you@example.com is 482913
```

In a real app you'll use the [sign-in box](/docs/client/sign-in-element/) instead of curl, and it does all of this for you.

## 5. Send real emails

Sign up for [Resend](https://resend.com), verify your domain, then:

```js
import { resend } from 'slauth/email/resend'

slauth({
  // ...
  email: resend({ apiKey: env.RESEND_API_KEY, from: 'My App <hi@myapp.dev>' }),
})
```

```sh
npx wrangler secret put SLAUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

:::tip
Add secrets as **Secrets**, not plain variables. `wrangler deploy` replaces plain variables that were set in the dashboard; secrets stay.
:::

That's it. Next: add the [sign-in box](/docs/client/sign-in-element/) to your page, or limit who can sign in with an [allow list](/docs/recipes/invite-only/).
