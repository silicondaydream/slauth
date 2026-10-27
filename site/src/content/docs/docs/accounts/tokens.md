---
title: Tokens for your APIs
description: Short-lived JWTs your other services can check with a public key.
---

When your app talks to a separate API (another Worker, a Go service, a Supabase function), that service needs to know who's calling without sharing your database or secret. Turn on tokens:

```js
slauth({
  ...,
  tokens: true,
  // or
  tokens: {
    minutes: 5,                       // how long each token lasts (default 5)
    issuer: 'https://myapp.dev',      // `iss`
    audience: 'api.myapp.dev',        // `aud`
    claims: (user) => ({ plan: user.metadata.plan }),
  },
})
```

In the browser:

```js
const token = await auth.getToken() // cached until a minute before it expires
await fetch('https://api.myapp.dev/things', { headers: { Authorization: `Bearer ${token}` } })
```

The token is an **ES256 JWT**:

```json
{ "sub": "usr_k3J…", "email": "me@example.com", "name": "Sam", "roles": ["admin"], "iat": 1767225600, "exp": 1767225900 }
```

## Checking it

**Anywhere**, with any JWT library, against the public keys at `/auth/jwks.json`:

```js
import { createRemoteJWKSet, jwtVerify } from 'jose'
const jwks = createRemoteJWKSet(new URL('https://myapp.dev/auth/jwks.json'))
const { payload } = await jwtVerify(token, jwks, { issuer: 'https://myapp.dev' })
```

**With slauth**, `auth.verifyToken(token)` gives the claims or `null`, and `auth.user(request)` accepts a JWT as a bearer token too.

## Keys

The signing key is made on first use and kept in your store, encrypted (AES-GCM) with a key derived from your `secret`, so a copy of the database alone can't sign tokens. Every server with the same store and secret uses the same key. If you change `secret`, a new key is made; tokens last minutes, so nothing much notices. `jwks.json` lists the current key and the two before it.

On the server, `auth.createToken(user, extraClaims?)` makes one directly.
