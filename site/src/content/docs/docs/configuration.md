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
  baseUrl,       // your site's address, for links in emails and provider callbacks
  signInPage,    // where provider errors and two-factor steps come back to
  freshMinutes,  // how recent a sign-in sensitive changes need (default: 15)
  passkeys,      // passkey settings, or false

  // Opt in to more:
  providers,     // "Sign in with GitHub/Google/…"
  magicLinks,    // a sign-in link in the code email
  passwords,     // optional passwords
  twoFactor,     // authenticator app codes
  tokens,        // JWTs for your other services
  organizations, // teams with roles and invitations
  on,            // events: signUp, signIn, signOut, userUpdated, userDeleted
  emails,        // your own email wording
  rateLimit,     // per-IP limits (on by default where the host gives an IP)
  allowDeletion, // people may delete their own account (default: true)

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
- a function: `(email, context) => boolean` (can be async), e.g. to check your own invites table. `context` has the `method` (`email`, `link`, `password`, `passkey`, `oauth`, `access`, `session`, `email-change`), and for providers the `provider` id and `profile`.

Checked when a code is asked for, when it's typed in, on every sign-in and on every request, so removing someone from the list locks them out. See [Invite-only apps](/docs/recipes/invite-only/).

### `basePath`

Where the [routes](/docs/reference/routes/) live. Default `'/auth'`. If you change it, tell the browser side too: `createClient({ basePath })` or `<slauth-sign-in base-path="...">`.

### `cookie` and `sessionDays`

The session cookie's name, and how many days a session lasts after the last visit (it slides: using the app restarts the clock, at most once a day). Defaults: `'slauth_session'`, `30`.

### `origins`

The origins allowed to send `POST`s to the routes and to use passkeys. Default: the request's own origin. Set it when your app is reachable at more than one address, or sits behind a proxy that changes the URL:

```js
origins: ['https://myapp.dev', 'https://www.myapp.dev']
```

### `baseUrl`

Your site's address, e.g. `'https://myapp.dev'`, used for links in emails and the callback URL sent to providers. Default: the address each request came in on. Set it when you're behind a proxy that changes the URL, or have several domains and want one canonical one.

### `signInPage`

The path of the page with your sign-in box, e.g. `'/login'`. Provider errors (`?slauth_error=…`), the two-factor step after a provider (`?slauth_step=two-factor`) and organization invitation links come back here. Default: the page the person started on.

### `freshMinutes`

Adding a passkey or password, changing email, turning on two-factor, linking a provider and deleting the account need a session this new. Default `15`; `false` turns the check off. See [Recent sign-in](/docs/accounts/sessions/#recent-sign-in).

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

### `providers`

`[github({ clientId, clientSecret }), google(…), oidc(…)]` from `slauthjs/providers`. See [Sign in with GitHub, Google & co.](/docs/sign-in/providers/)

### `magicLinks`

`true` adds a one-tap link to the code email. See [Magic links](/docs/sign-in/magic-links/).

### `passwords`

`true`, or `{ minLength, iterations, validate }`. See [Passwords](/docs/sign-in/passwords/).

### `twoFactor`

`true`, or `{ issuer }` (the name in authenticator apps; default `appName`). See [Two-factor sign-in](/docs/sign-in/two-factor/).

### `tokens`

`true`, or `{ minutes, issuer, audience, claims }`. See [Tokens for your APIs](/docs/accounts/tokens/).

### `organizations`

`true`, or `{ allowCreate, invitePage }`. See [Organizations](/docs/accounts/organizations/).

### `on` and `emails`

Event handlers and your own email wording. See [Events and custom emails](/docs/accounts/events/).

### `rateLimit`

Per-IP limits on the routes that send email or check a guess. On by default, counting by `CF-Connecting-IP`, `Fly-Client-IP` or `X-Real-IP` (whichever your host sets; with none, only the per-email and per-code limits apply).

```js
rateLimit: {
  limits: { 'email/start': [10, 600], 'password/signin': [20, 600] }, // [requests, per seconds]
  ip: (request) => request.headers.get('x-forwarded-for')?.split(',')[0] ?? null, // only if your proxy sets it
}
```

`rateLimit: false` turns it off.

### `allowDeletion`

`false` stops people deleting their own account at `POST /auth/user/delete`. `auth.users.delete(id)` still works.

### `access`

Also count people signed in by Cloudflare Access as signed in. See [Cloudflare Access](/docs/sign-in/cloudflare-access/).

### `lock`

The optional PIN app lock. `true`, or `{ default: 'never' | 'always' | 'daily' | 'weekly', cookie }`. See [App lock](/docs/sign-in/app-lock/).
