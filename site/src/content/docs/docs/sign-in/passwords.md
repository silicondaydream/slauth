---
title: Passwords
description: Optional passwords, for people who'd rather type one.
---

slauth is happiest without passwords, but some people want one, and some apps need one.

```js
slauth({ ..., passwords: true })
// or
passwords: {
  minLength: 10,                 // default 8
  iterations: 100_000,           // PBKDF2 rounds; 100,000 is the most Workers allows
  validate: async (password) => (await isPwned(password) ? 'That password has been in a data breach.' : null),
}
```

## How it works

- **Nobody gets a password without proving their email.** Signing up with a password emails a code (and a link, with [magic links](/docs/sign-in/magic-links/)); the password is saved once that's used. So nobody can take an address they don't own.
- **"Forgot password?" is just an email code.** Sign in with a code, then set a new password. There's no reset token to leak.
- Hashed with **PBKDF2-SHA256** and a random salt per password, from Web Crypto. Each hash records its round count, so you can raise `iterations` later and old passwords keep working.
- **10 wrong passwords** for an email lock password sign-in for that email for 15 minutes (email codes still work), plus the [per-IP limit](/docs/concepts/security/#rate-limits).
- A wrong password and an unknown email get the same answer, after the same amount of work.
- **Changing** a password takes the current one or a [recent sign-in](/docs/accounts/sessions/#recent-sign-in), and signs out every other session.

## The sign-in box

With `passwords` on, [`<slauth-sign-in>`](/docs/client/sign-in-element/) shows "Use a password" and "Create an account". Start on the sign-up form with `mode="sign-up"`.

## Your own forms

```js
import { createClient } from 'slauthjs/client'
const auth = createClient()

// Sign up: emails a code, then
await auth.password.signUp(email, password)
await auth.email.verify(email, code) // saves the password and signs in

// Sign in
const result = await auth.password.signIn(email, password)
if (result.twoFactor) showTwoFactorStep()

// Settings
await auth.password.set(newPassword, currentPassword)
await auth.password.remove()
```

On the server, `auth.passwords.set(userId, password)`, `has`, `remove` and `hash` are there for imports and support.

## Moving users over

If you're coming from another system with bcrypt or argon2 hashes, slauth can't check those. The friendly path: import the users (`auth.users.create`), and let them sign in with an email code once, then set a password.
