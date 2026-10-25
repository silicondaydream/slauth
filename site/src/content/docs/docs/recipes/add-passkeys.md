---
title: Adding passkeys to an existing app
description: Offer passkeys to people who already sign in with email codes.
---

Passkeys are on by default. If you use the [sign-in box](/docs/client/sign-in-element/), people are offered one right after their next email sign-in, and there's nothing to do.

To add a button to your settings page:

```js
import { createClient } from 'slauth/client'
const auth = createClient()

if (auth.passkey.supported()) {
  button.hidden = false
  button.onclick = async () => {
    await auth.passkey.register(prompt('Name this passkey', 'My phone') ?? undefined)
    renderList((await auth.passkey.list()).passkeys)
  }
}
```

And "Sign in with a passkey" on your sign-in page:

```js
const { user } = await auth.passkey.signIn()
location.assign('/')
```

Before your app has real users with passkeys, set `passkeys.rpId` to the domain you'll keep (usually the bare domain). Passkeys are tied to it.
