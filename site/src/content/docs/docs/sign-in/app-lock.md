---
title: App lock (PIN)
description: An optional 4-digit PIN on top of sign-in, asked as often as each person likes.
---

Sign-in says *who* someone is. The app lock asks "is it still you holding the phone?" with a 4-digit PIN, as often as **each person** chooses:

| Policy | Asks for the PIN |
|---|---|
| `always` | every visit (ends when the browser closes, at most 12 hours) |
| `daily` | once a day |
| `weekly` | once a week |
| `never` | never; signing in is enough |

Good for a budget app on a shared iPad, a journal, anything you'd rather a borrowed phone didn't open.

## Turning it on

```js
slauth({
  // ...
  lock: { default: 'never' }, // or 'always' | 'daily' | 'weekly'; `lock: true` means 'never'
})
```

`default` is the policy for people who haven't picked one. With `'never'`, nobody sees a PIN until they turn it on in your Settings page.

`auth.requireUser(request)` now also refuses people who are locked, with `{ code: 'locked' }`, and `GET /auth/session` includes `lock: { policy, required, pinSet, unlocked }`.

## In the browser

```js
const auth = createClient()
await auth.lock.setup('2580', 'daily')   // create a PIN (first time)
await auth.lock.skip()                  // or: no PIN for me
await auth.lock.unlock('2580')          // when locked
await auth.lock.setPolicy('weekly', '2580') // changing it needs the current PIN
await auth.lock.changePin('2580', '1379')   // locks their other devices
await auth.lock.lockNow()
```

## The rules

- PINs are stored as salted PBKDF2-SHA256 (100,000 rounds).
- After 5 wrong tries the PIN pad locks for 5 minutes, doubling up to an hour, per person.
- Making the policy stricter applies right away, even to unlocks already handed out.
- Each person's unlock cookie is signed with their own key, so one person's unlock never opens the app for someone else on the same device.
