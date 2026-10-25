---
title: Storage keys
description: Everything slauth writes to your store.
---

| Key | Value | Lives |
|---|---|---|
| `user:<id>` | `{ id, email, createdAt }` | forever |
| `email:<email>` | the user's id | forever |
| `session:<sha256 of token>` | `{ userId, createdAt, refreshedAt }` | 30 days, renewed |
| `code:<email>` | `{ hash, expiresAt, tries, sentAt }` | 10 minutes |
| `challenge:<challenge>` | `{ type, userId? }` | 5 minutes |
| `passkey:<credential id>` | `{ id, userId, publicKey, alg, counter, name, createdAt, lastUsedAt, transports }` | forever |
| `passkeys:<user id>` | list of credential ids | forever |
| `lock:<user id>` | the PIN lock: `{ pinHash, salt, sessionKey, failures, lockedUntil, policy }` | forever |

User ids look like `usr_` followed by 20 random characters.

## Deleting someone

```js
const user = await auth.store.get(`user:${id}`)
for (const pk of (await auth.store.get(`passkeys:${id}`)) ?? []) await auth.store.delete(`passkey:${pk}`)
for (const key of [`user:${id}`, `email:${user.email}`, `passkeys:${id}`, `lock:${id}`]) await auth.store.delete(key)
```

Their sessions stop working at once (the user is gone) and expire from the store on their own.
