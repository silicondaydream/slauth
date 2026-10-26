---
title: Adding passkeys to an existing app
description: Offer passkeys to people who already sign in with email codes.
---

Passkeys are on by default. If you use the [sign-in box](/docs/client/sign-in-element/), people are offered one right after their next email sign-in, and there's nothing to do.

For a settings page, [`<slauth-account>`](/docs/client/account-element/) has passkeys built in. To add just a button:

```js
import { createClient } from 'slauthjs/client'
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

Adding a passkey needs a [recent sign-in](/docs/accounts/sessions/#recent-sign-in) (15 minutes by default), so a stolen session can't add one; if it's been longer, the answer is `reauth-required`.

Before your app has real users with passkeys, set `passkeys.rpId` to the domain you'll keep (usually the bare domain). Passkeys are tied to it.
