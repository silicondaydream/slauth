---
title: Passkeys
description: Face ID, Touch ID, Windows Hello or a security key, with WebAuthn checked in Web Crypto.
---

Passkeys are on by default. Someone who's signed in can add one; after that, signing in is a tap.

## In the browser

The [sign-in box](/docs/client/sign-in-element/) offers "Add a passkey" right after an email sign-in, and shows "Sign in with a passkey" on the first screen. To do it yourself:

```js
import { createClient } from 'slauthjs/client'
const auth = createClient()

if (auth.passkey.supported()) {
  await auth.passkey.register('My laptop') // while signed in
}

// later, signed out:
const { user } = await auth.passkey.signIn()
```

`signIn()` uses *discoverable* passkeys: the browser shows the person their passkeys for your site, so they don't need to type their email first.

## Settings

```js
slauth({
  // ...
  passkeys: {
    rpId: 'myapp.dev',             // the site passkeys belong to
    rpName: 'My App',              // shown on the prompt (default: appName)
    origin: 'https://myapp.dev',   // where sign-ins may come from
    userVerification: 'preferred', // 'required' to insist on biometrics/PIN
  },
})
```

**`rpId`** defaults to the request's hostname. Set it to your bare domain (`myapp.dev`) and the same passkeys work on every subdomain (`app.myapp.dev`, `admin.myapp.dev`). Once people have passkeys, don't change it: passkeys are tied to the rpId.

On `localhost`, everything works without settings. Browsers treat localhost as secure.

## Managing passkeys

```js
const { passkeys } = await auth.passkey.list() // [{ id, name, createdAt, lastUsedAt }]
await auth.passkey.remove(passkeys[0].id)
```

## Turning them off

```js
slauth({ /* ... */ passkeys: false })
```

and `<slauth-sign-in no-passkeys>` on the page.

## How it's checked

On registration slauth checks the challenge (single use, 5 minutes), the origin, that the rpId hash matches, and that the user was present, then stores the public key (ES256 or RS256). On sign-in it checks the same things plus the signature and the sign counter. No attestation, no libraries: the CBOR and WebAuthn code is about 300 lines in `src/passkey/`.
