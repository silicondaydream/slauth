---
title: How it works
description: Users, sessions, stores and the allow list, in two minutes.
---

slauth has four moving parts.

## Users

A user is `{ id, email, name, image, roles, metadata, createdAt }` (see [Users](/docs/accounts/users/)). Anything else (settings, their data) belongs in your own tables, keyed by `user.id`:

```js
const user = await auth.user(request)
const notes = await env.DB.prepare('SELECT * FROM notes WHERE user_id = ?').bind(user.id).all()
```

A user is created the first time someone signs in with an email the [allow list](/docs/configuration/#allow) lets in. The same email always gets the same `id`, however they sign in (email code, link, password, passkey, a provider with a verified email, or Cloudflare Access).

## Sessions

Signing in sets one cookie, `slauth_session`:

- it holds a random 256-bit token; the store keeps only its SHA-256, so a leaked database can't be used to sign in;
- it's `HttpOnly` (JavaScript can't read it), `SameSite=Lax`, and `Secure` on https;
- it lasts 30 days from the **last** visit (it's renewed at most once a day, when the browser calls `GET /auth/session`);
- signing out deletes it from the store, so a copied cookie stops working too.

## Stores

slauth needs a key-value store with three methods:

```ts
interface Store {
  get(key: string): Promise<any>
  put(key: string, value: unknown, options?: { ttl?: number }): Promise<void> // ttl in seconds
  delete(key: string): Promise<void>
  list?(prefix: string, options?: { limit?: number; cursor?: string }): Promise<{ items: { key: string; value: any }[]; cursor: string | null }> // only for auth.users.list()
}
```

D1, SQLite, Workers KV and memory come built in. [Writing your own](/docs/stores/#write-your-own) takes about ten lines. The [storage keys](/docs/reference/storage-keys/) page lists everything slauth writes.

## Routes

`auth.handle(request)` answers every route under `/auth/`: asking for a code, checking it, passkeys, providers, signing out, the session and everything else you turn on. Your code asks two questions:

- `await auth.user(request)`: who's signed in? (`null` if nobody)
- `await auth.requireUser(request)`: the signed-in, unlocked person, or a ready-made `401` Response to return.

```js
const user = await auth.requireUser(request)
if (user instanceof Response) return user
```

The browser side talks to the routes through [the sign-in box](/docs/client/sign-in-element/) or [the client helpers](/docs/client/helpers/).
