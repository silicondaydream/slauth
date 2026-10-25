---
title: Email
description: Sending the 6-digit codes with Resend, Cloudflare Email Service, the console, or anything else.
---

## Console (the default)

Without an `email` option, codes are printed where your server logs:

```
  🦥 slauth: My App sign-in code for you@example.com is 482913
```

Perfect for building, useless for real people. slauth warns once at startup if you haven't set a sender.

## Resend

```js
import { resend } from 'slauth/email/resend'

slauth({
  // ...
  email: resend({ apiKey: env.RESEND_API_KEY, from: 'My App <hi@myapp.dev>' }),
})
```

`from` must be on a domain you've verified in Resend. Its free tier is plenty for a side project.

## Cloudflare Email Service

On Workers, with a `send_email` binding:

```jsonc title="wrangler.jsonc"
"send_email": [{ "name": "EMAIL" }]
```

```js
import { cloudflareEmail } from 'slauth/email/cloudflare'

slauth({
  // ...
  email: cloudflareEmail(env.EMAIL, { from: 'hi@myapp.dev' }),
})
```

## Anything else

A sender is an object with `send()`:

```js
const postmark = {
  async send({ to, subject, text, html, code, appName }) {
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': env.POSTMARK_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: 'hi@myapp.dev', To: to, Subject: subject, TextBody: text, HtmlBody: html }),
    })
  },
}

slauth({ /* ... */ email: postmark })
```

`subject`, `text` and `html` are ready to send. `code` and `appName` are there if you'd rather write your own email. If `send()` throws, the request fails with a 500 and the person can try again.
