---
title: API
description: Everything slauth exports.
---

## `slauth(config)`

Options are on the [Configuration](/docs/configuration/) page.

### `auth.handle(request) → Promise<Response>`

Answers every [route](/docs/reference/routes/) under `basePath`. For anything else it returns a `404`, so it's safe to call with any request.

### `auth.user(request) → Promise<SlauthUser | null>`

The signed-in person (`{ id, email, name, image, roles, metadata, createdAt }`), or `null`. Reads the session cookie, a bearer session token, a [JWT](/docs/accounts/tokens/) (with `tokens` on), then Cloudflare Access if configured. Doesn't look at the app lock.

### `auth.requireUser(request, { role? }) → Promise<SlauthUser | Response>`

The signed-in **and unlocked** person, or a JSON Response to return as it is: `401` (`signed-out` or `locked`), or `403 forbidden` when `role` (a string or a list) is given and they have none of them.

### `auth.session(request)`

`{ user, session: { id, userId, createdAt, method, impersonatorId } | null }` or `null`.

### `auth.users`

`get(id)`, `byEmail(email)`, `list({ limit, cursor })`, `create({ email, … })`, `update(id, patch)`, `delete(id)`, `ban(id)`, `unban(id)`. See [Users, roles and admin](/docs/accounts/users/).

### `auth.sessions`

`list(userId)`, `revoke(userId, id)`, `revokeAll(userId)`, `create(userId, request, { method?, impersonatorId? }) → { cookie, token }`. See [Sessions](/docs/accounts/sessions/).

### `auth.accounts.list(userId)`

Linked providers, with tokens for providers with `keepTokens`.

### `auth.passwords`, `auth.twoFactor`, `auth.orgs`

`null` unless turned on. See [Passwords](/docs/sign-in/passwords/), [Two-factor](/docs/sign-in/two-factor/), [Organizations](/docs/accounts/organizations/).

### `auth.createToken(user, extra?)`, `auth.verifyToken(token)`

Needs `tokens`. See [Tokens for your APIs](/docs/accounts/tokens/).

### `auth.store`

The store you passed in.

## Providers (`slauthjs/providers`)

`github()`, `google()`, `discord()`, `gitlab()`, `microsoft()`, `oidc()`, `oauth2()`. See [Providers](/docs/sign-in/providers/).

## Stores

`memory()`, `d1(db, { table? })`, `kv(namespace, { prefix? })`, `sqlite(db, { table? })`. See [Stores](/docs/stores/).

## Email senders

`consoleEmail()`, `resend({ apiKey, from })`, `cloudflareEmail(binding, { from })`. See [Email](/docs/email/).

## Browser

- `createClient({ basePath?, fetch?, token? })`: see [Client helpers](/docs/client/helpers/).
- `SlauthError`: `{ message, code, status, ...details }`.
- `import 'slauthjs/element'`: registers [`<slauth-sign-in>`](/docs/client/sign-in-element/).
- `import 'slauthjs/account'`: registers [`<slauth-account>`](/docs/client/account-element/).

## Node

`toNodeHandler(auth)` and `toRequest(req)`. See [Node and Express](/docs/frameworks/node-express/).

## Lower-level pieces

- `hashPassword(password, iterations?)`, `verifyPassword(password, hash)`: the PBKDF2 hashing slauth uses.
- `totp(secret, step?)`: the current code for a base32 secret, for tests and tools.
- `createAccess({ teamDomain, audience, allowedEmails?, aliases?, devUser? })` → `{ getUser(request) }`: the Cloudflare Access check on its own.
- `createLock(store, { cookie?, defaultPolicy? })` → `{ handle, isUnlocked }`: the PIN lock on its own.
- `userIdFor(email)`: the id `createAccess` uses (a hash of the email).

## Types

`SlauthConfig`, `Slauth`, `SlauthUser`, `StoredUser`, `Store`, `EmailSender`, `Provider`, `Profile`, `Org`, `OrgMember`, `OrgInvite`, `SessionInfo`, `LinkedAccount`, `TokenClaims`, `Policy` and `SlauthClient` are all exported for TypeScript.
