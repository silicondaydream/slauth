---
title: Sessions and devices
description: Seeing and ending sessions, recent sign-in checks, and apps without cookies.
---

Every sign-in makes a session: a random token in an `HttpOnly` cookie, of which the store keeps only a SHA-256 (see [How it works](/docs/concepts/how-it-works/#sessions)).

## Signed-in devices

```js
const { sessions } = await auth.sessions.list()
// [{ id, createdAt, lastActiveAt, method: 'email' | 'passkey' | 'oauth:github' | …, userAgent, ip, current }]

await auth.sessions.revoke(id)      // sign that device out
await auth.sessions.revokeOthers()  // everywhere but here
```

[`<slauth-account>`](/docs/client/account-element/) has this list built in. Changing a password signs out every other session too. Someone can have 50 sessions at once; past that, the oldest is signed out.

## Recent sign-in

Some changes would let someone with a stolen session lock the real owner out, or keep a way back in. So they need a session started in the last 15 minutes:

- adding a passkey
- setting or removing a password (changing one also works with the current password)
- changing email
- turning on two-factor
- linking a provider
- deleting the account

Otherwise the answer is `403 reauth-required`: sign out and back in, then try again. The sign-in box's passkey offer comes straight after sign-in, so it's never affected. Change the window with `freshMinutes`, or turn the check off with `freshMinutes: false`.

## The session in your code

```js
const found = await auth.session(request)
// { user, session: { id, userId, createdAt, method, impersonatorId } } or null
```

## Apps without cookies

Mobile apps, desktop apps and CLIs can't always keep cookies. Send `X-Slauth-Transport: bearer` with sign-in requests and slauth answers with the token in the body instead of a cookie:

```http
POST /auth/email/verify
Content-Type: application/json
X-Slauth-Transport: bearer

{ "email": "me@example.com", "code": "482913" }
→ { "user": { … }, "token": "rJx…" }
```

Then send it as `Authorization: Bearer rJx…`. `auth.user(request)` reads it like a cookie, and `POST /auth/signout` with it ends that session. With two-factor, the first step answers `{ twoFactor: true, pendingToken }`; send `pendingToken` with `two-factor/verify`.

`createClient` does this for you when you give it somewhere to keep the token:

```js
const auth = createClient({
  basePath: 'https://myapp.dev/auth',
  token: { get: () => SecureStore.getItem('slauth'), set: (t) => (t ? SecureStore.setItem('slauth', t) : SecureStore.deleteItem('slauth')) },
})
```

Provider sign-in and magic links are browser flows (redirects), so they don't do bearer tokens.

For calling **other** services, use [tokens](/docs/accounts/tokens/) instead: short-lived JWTs they can check without your database.
