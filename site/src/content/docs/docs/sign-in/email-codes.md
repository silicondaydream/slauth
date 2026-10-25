---
title: Email codes
description: Sign in with a 6-digit code sent by email.
---

The default way in. Someone types their email, gets a code, types the code.

```js
const auth = slauth({
  secret: env.SLAUTH_SECRET,
  store: d1(env.DB),
  email: resend({ apiKey: env.RESEND_API_KEY, from: 'My App <hi@myapp.dev>' }),
  appName: 'My App',
})
```

## The flow

1. `POST /auth/email/start` with `{ "email": "me@example.com" }` sends a code.
2. `POST /auth/email/verify` with `{ "email": "me@example.com", "code": "482913" }` checks it, creates the user on first sign-in, and sets the session cookie. It replies with `{ "user": { ... } }`.

The [sign-in box](/docs/client/sign-in-element/) and [`createClient()`](/docs/client/helpers/) do both steps for you.

## The rules

| | |
|---|---|
| Code length | 6 digits |
| Valid for | 10 minutes |
| Tries per code | 5 |
| New code | once a minute per address |
| Stored as | HMAC-SHA256 with your `secret` |

Errors come back with a `code` you can switch on: `bad-email`, `not-allowed`, `slow-down` (with `retryAfter` seconds), `bad-code` (with `triesLeft`), `too-many-tries`, `expired`. See [Errors](/docs/reference/errors/).

## The email

Subject: **482913 is your My App sign-in code**. There's a plain-text version and a small HTML version with the code in big letters. To send it, pick a sender on the [Email](/docs/email/) page, or write your own: it receives `subject`, `text` and `html` ready to go, plus `to`, `code` and `appName` if you'd rather build your own.

:::tip
Putting the code first in the subject means it shows up in phone notifications, and iOS and Android offer to fill it in automatically (the code field uses `autocomplete="one-time-code"`).
:::
