---
title: Client helpers
description: createClient(), for building your own sign-in screens.
---

When you want your own UI, `createClient()` wraps every route:

```js
import { createClient, SlauthError } from 'slauth/client'

const auth = createClient() // { basePath: '/auth' }

const { user } = await auth.session() // null when signed out

await auth.email.start('me@example.com')
const signedIn = await auth.email.verify('me@example.com', '482913')

await auth.passkey.register('My phone')
await auth.passkey.signIn()
await auth.signOut()
```

## Handling errors

Everything that isn't a success throws a `SlauthError` with a `code`:

```js
try {
  await auth.email.verify(email, code)
} catch (error) {
  if (!(error instanceof SlauthError)) throw error
  switch (error.code) {
    case 'bad-code':
      return show(`That's not it. ${error.triesLeft} tries left.`)
    case 'expired':
    case 'too-many-tries':
      return show('Ask for a new code.')
    case 'offline':
      return show("You're offline.")
    default:
      return show(error.message) // always human-readable
  }
}
```

All the codes are on the [Errors](/docs/reference/errors/) page.

## Everything it has

| | |
|---|---|
| `session()` | `{ user, lock? }` |
| `email.start(email)` / `email.verify(email, code)` | the email-code flow |
| `passkey.supported()` | can this browser do passkeys? |
| `passkey.register(name?)` / `passkey.signIn()` | add one / sign in with one |
| `passkey.list()` / `passkey.remove(id)` | manage them |
| `signOut()` | end the session |
| `lock.*` | the [app lock](/docs/sign-in/app-lock/): `setup`, `skip`, `unlock`, `setPolicy`, `changePin`, `lockNow` |

Pass `createClient({ fetch })` to use your own `fetch`, e.g. in tests.
