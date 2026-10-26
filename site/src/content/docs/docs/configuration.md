---
title: Configuration
description: Every option slauth() takes.
---

```js
const auth = slauth({
  secret,        // required
  store,         // required
  email,         // how codes are sent (default: printed to the console)
  appName,       // shown in emails and on passkey prompts
  allow,         // who may sign in (default: anyone)
  basePath,      // where the routes live (default: '/auth')
  cookie,        // session cookie name (default: 'slauth_session')
  sessionDays,   // default: 30
  origins,       // origins allowed to post (default: the request's own)
  passkeys,      // passkey settings, or false
  access,        // also accept Cloudflare Access sign-ins
  lock,          // the optional PIN app lock
})
```

### `secret` (required)

A random string of at least 16 characters. It signs the email codes (only an HMAC of each code is stored). Make one with `openssl rand -base64 32` and keep it in a secret, not in your code.

Changing it only invalidates codes that are waiting to be typed in. Sessions and passkeys keep working.

### `store` (required)

Where users, sessions, codes and passkeys live. See [Stores](/docs/stores/).

### `email`

How the 6-digit codes are sent. See [Email](/docs/email/). Without one, codes are printed to the console, which is handy while you build and useless in production.

### `appName`

Shown in the email ("482913 is your **My App** sign-in code") and as the site name on passkey prompts. Default: `'your app'`.

### `allow`

Who may sign in. Leave it out to let anyone in. Otherwise either:

- a list: `['me@example.com', 'sis@example.com', '@family.com']`. An entry starting with `@` lets in a whole domain.
- a function: `(email) => boolean` (can be async), e.g. to check your own invites table.

Checked when a code is asked for, when it's typed in, and on every passkey sign-in, so removing someone from the list locks them out. See [Invite-only apps](/docs/recipes/invite-only/).

### `basePath`

Where the [routes](/docs/reference/routes/) live. Default `'/auth'`. If you change it, tell the browser side too: `createClient({ basePath })` or `<slauth-sign-in base-path="...">`.

### `cookie` and `sessionDays`

The session cookie's name, and how many days a session lasts after the last visit (it slides: using the app restarts the clock, at most once a day). Defaults: `'slauth_session'`, `30`.

### `origins`

The origins allowed to send `POST`s to the routes and to use passkeys. Default: the request's own origin. Set it when your app is reachable at more than one address, or sits behind a proxy that changes the URL:

```js
origins: ['https://myapp.dev', 'https://www.myapp.dev']
```

### `passkeys`

```js
passkeys: {
  rpId: 'myapp.dev',          // default: the request's hostname
  rpName: 'My App',           // default: appName
  origin: 'https://myapp.dev',// default: origins, then the request's origin
  userVerification: 'preferred', // or 'required' / 'discouraged'
}
```

`passkeys: false` turns passkeys off. See [Passkeys](/docs/sign-in/passkeys/).

### `access`

Also count people signed in by Cloudflare Access as signed in. See [Cloudflare Access](/docs/sign-in/cloudflare-access/).

### `lock`

The optional PIN app lock. `true`, or `{ default: 'never' | 'always' | 'daily' | 'weekly', cookie }`. See [App lock](/docs/sign-in/app-lock/).
