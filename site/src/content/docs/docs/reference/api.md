---
title: API
description: Everything slauth exports.
---

## `slauth(config)`

Returns `{ handle, user, requireUser, store }`. Options are on the [Configuration](/docs/configuration/) page.

### `auth.handle(request) → Promise<Response>`

Answers every [route](/docs/reference/routes/) under `basePath`. For anything else it returns a `404`, so it's safe to call with any request.

### `auth.user(request) → Promise<SlauthUser | null>`

The signed-in person (`{ id, email, createdAt }`), or `null`. Reads the session cookie, then Cloudflare Access if configured. Doesn't look at the app lock.

### `auth.requireUser(request) → Promise<SlauthUser | Response>`

The signed-in **and unlocked** person, or a `401` JSON Response (`code: 'signed-out'` or `'locked'`) to return as it is.

### `auth.store`

The store you passed in.

## Stores

`memory()`, `d1(db, { table? })`, `kv(namespace, { prefix? })`, `sqlite(db, { table? })`. See [Stores](/docs/stores/).

## Email senders

`consoleEmail()`, `resend({ apiKey, from })`, `cloudflareEmail(binding, { from })`. See [Email](/docs/email/).

## Browser

- `createClient({ basePath?, fetch? })`: see [Client helpers](/docs/client/helpers/).
- `SlauthError`: `{ message, code, status, ...details }`.
- `import 'slauth/element'`: registers [`<slauth-sign-in>`](/docs/client/sign-in-element/).

## Node

`toNodeHandler(auth)` and `toRequest(req)`. See [Node and Express](/docs/frameworks/node-express/).

## Lower-level pieces

- `createAccess({ teamDomain, audience, allowedEmails?, aliases?, devUser? })` → `{ getUser(request) }`: the Cloudflare Access check on its own.
- `createLock(store, { cookie?, defaultPolicy? })` → `{ handle, isUnlocked }`: the PIN lock on its own.
- `userIdFor(email)`: the id `createAccess` uses (a hash of the email).

## Types

`SlauthConfig`, `Slauth`, `SlauthUser`, `Store`, `EmailSender`, `Policy`, `SlauthClient` are all exported for TypeScript.
