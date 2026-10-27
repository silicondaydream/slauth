---
title: Client helpers
description: createClient(), for building your own sign-in screens.
---

When you want your own UI, `createClient()` wraps every route:

```js
import { createClient, SlauthError } from 'slauthjs/client'

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

## Two-factor

Every sign-in call can answer `{ twoFactor: true }` instead of `{ user }` when the person has [two-factor](/docs/sign-in/two-factor/) on:

```js
const result = await auth.password.signIn(email, password)
if (result.twoFactor) await auth.twoFactor.verify(await askForCode())
```

## Everything it has

| | |
|---|---|
| `session()` | `{ user, twoFactor?, lock? }` |
| `config()` | what's turned on, and the providers |
| `email.start(email, { redirect? })` / `email.verify(email, code)` | the email-code flow |
| `email.change.start(email)` / `email.change.verify(email, code)` | change address |
| `oauth.signIn(id, { redirect? })` / `oauth.link(id)` / `oauth.url(id)` | [providers](/docs/sign-in/providers/) |
| `password.signIn` / `signUp` / `set` / `remove` | [passwords](/docs/sign-in/passwords/) |
| `twoFactor.verify` / `setup` / `enable` / `disable` / `recoveryCodes` | [two-factor](/docs/sign-in/two-factor/) |
| `passkey.supported()` | can this browser do passkeys? |
| `passkey.register(name?)` / `passkey.signIn()` | add one / sign in with one |
| `passkey.list()` / `rename(id, name)` / `remove(id)` | manage them |
| `user.update({ name, image })` / `user.delete()` | the profile |
| `sessions.list()` / `revoke(id)` / `revokeOthers()` | [devices](/docs/accounts/sessions/) |
| `accounts.list()` / `unlink(provider)` | linked providers |
| `getToken()` | a [JWT](/docs/accounts/tokens/) for your APIs, cached |
| `orgs.*` | [organizations](/docs/accounts/organizations/) and invitations |
| `signOut()` | end the session |
| `lock.*` | the [app lock](/docs/sign-in/app-lock/): `setup`, `skip`, `unlock`, `setPolicy`, `changePin`, `lockNow` |

Pass `createClient({ fetch })` to use your own `fetch`, e.g. in tests, and `createClient({ token: { get, set } })` for [apps without cookies](/docs/accounts/sessions/#apps-without-cookies).
