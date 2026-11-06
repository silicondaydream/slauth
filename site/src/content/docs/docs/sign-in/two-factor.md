---
title: Two-factor sign-in
description: Authenticator app codes (TOTP) with recovery codes.
---

```js
slauth({ ..., twoFactor: true })
```

People can then turn on a code from an authenticator app (1Password, Google Authenticator, Authy, the iPhone's Passwords app…). After the first step of signing in (an email code, a link, a password or a provider) they get `{ twoFactor: true }` instead of a session, and finish with the 6-digit code.

**Passkeys skip it.** A passkey is already two factors: something you have (the device) and something you are or know (Face ID, a PIN).

## Turning it on

[`<slauth-account>`](/docs/client/account-element/) does all of this. By hand:

```js
const { secret, uri } = await auth.twoFactor.setup()   // needs a recent sign-in
showQrCode(uri)          // otpauth://totp/… ; any QR library will do
const { recoveryCodes } = await auth.twoFactor.enable(codeFromTheApp)
showOnce(recoveryCodes)  // 10 codes like "k3m9p-x2qrt"
```

slauth doesn't draw the QR code (it would be the biggest file in the library). The account element shows the key to type and an "open in app" link instead; for a QR code, pass `uri` to any QR library.

## Signing in

```js
const result = await auth.email.verify(email, code)
if (result.twoFactor) {
  const { user } = await auth.twoFactor.verify(appCode)
  // or: await auth.twoFactor.verify({ recoveryCode })
}
```

The sign-in box handles this step, including "Lost your phone?" for recovery codes. After a provider sign-in, people come back to your sign-in page with `?slauth_step=two-factor`, and the box picks up from there.

## The details

- RFC 6238: 6 digits, 30 seconds, SHA-1 (what every app supports). A code is accepted for the 30 seconds either side, and **only once**.
- 5 wrong codes and the half-finished sign-in is thrown away; they start again.
- Recovery codes work once each. Only their SHA-256 is stored. `auth.twoFactor.recoveryCodes(appCode)` makes a fresh set.
- Turning it off takes a code (or a recovery code).
- Support: `auth.twoFactor.disable(userId)` on the server, for someone who's lost both.
- The secret is stored as-is in your store, like a password manager would. Someone with your database *and* the person's first factor could pass the second.
