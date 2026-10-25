---
title: A suite of apps
description: Several small apps with one sign-in, for you, your family and friends.
---

slauth grew out of exactly this: a budget app, a food journal and a to-do list, used by a handful of people, with one sign-in across all of them.

## The setup

1. **One domain, a subdomain per app**: `budget.example.com`, `food.example.com`, `todo.example.com`.
2. **Cloudflare Access in front of all of them**, with one application covering every hostname and an email policy listing your people. Signing in once covers every app.
3. **Each app uses slauth with `access`**, its own database, and the app lock:

```js
const auth = slauth({
  secret: env.SLAUTH_SECRET,
  store: d1(env.DB),
  access: { team: env.ACCESS_TEAM, aud: env.ACCESS_AUD },
  lock: { default: 'never' },
})
```

## Why it works

- **Same people everywhere.** Each app gives the same email the same user, and its data stays in that app's own database. A bug in one app can't touch another's data.
- **Each person picks their own PIN, per app.** The budget can ask every time, the to-do list never.
- **No passwords, no extra logins.** Access handles the sign-in; slauth handles who's who and the lock.

## Without Access

Use email codes instead, and put passkeys' `rpId` on the parent domain so one passkey works in every app:

```js
passkeys: { rpId: 'example.com' }
```

Sessions are still per app (each subdomain has its own cookie), but signing in is one tap with a passkey.
