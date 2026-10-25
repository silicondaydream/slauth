---
title: Stores
description: Where slauth keeps users, sessions and passkeys. D1, SQLite, Workers KV, memory, or your own.
---

A store is anything with `get`, `put` and `delete`. Pick the one that matches where your app already keeps data.

## Cloudflare D1

```js
import { d1 } from 'slauth/stores/d1'
slauth({ secret, store: d1(env.DB) })
```

Creates a `slauth_kv` table on first use, so there are no migrations to run, and it sits happily next to your own tables. Pick another name with `d1(env.DB, { table: 'auth_kv' })`. **The best default on Workers.**

## SQLite

```js
import { sqlite } from 'slauth/stores/sqlite'

// Bun
import { Database } from 'bun:sqlite'
slauth({ secret, store: sqlite(new Database('app.db')) })

// Node 22+
import { DatabaseSync } from 'node:sqlite'
slauth({ secret, store: sqlite(new DatabaseSync('app.db')) })

// better-sqlite3
import Database from 'better-sqlite3'
slauth({ secret, store: sqlite(new Database('app.db')) })
```

Anything with `prepare(sql).get(...)` and `.run(...)` works. Also creates its own table.

## Cloudflare Workers KV

```js
import { kv } from 'slauth/stores/kv'
slauth({ secret, store: kv(env.AUTH) })
```

Keys get a `slauth:` prefix (change it with `{ prefix }`). Two things to know: KV is *eventually consistent*, so a new sign-in can take a moment to be seen in other regions, and its free tier allows 1,000 writes a day. Prefer D1 if you can.

## Memory

```js
import { memory } from 'slauth'
slauth({ secret, store: memory() })
```

For tests and trying things out. Everything is forgotten when the process stops.

## Write your own

Ten lines for almost any database. Here's Deno KV:

```js
const kv = await Deno.openKv()

const denoKv = {
  get: async (key) => (await kv.get(['slauth', key])).value ?? null,
  put: (key, value, { ttl } = {}) => kv.set(['slauth', key], value, ttl ? { expireIn: ttl * 1000 } : undefined),
  delete: (key) => kv.delete(['slauth', key]),
}

slauth({ secret, store: denoKv })
```

The contract:

- `get(key)` returns what was `put` (any JSON value), or `null`/`undefined` when there's nothing or it expired.
- `put(key, value, { ttl })` stores a JSON value. `ttl` is in **seconds**; without it, keep the value forever.
- `delete(key)` removes it (and doesn't mind if it isn't there).

Keys are short strings like `user:usr_…` and `session:…`. The full list is on the [storage keys](/docs/reference/storage-keys/) page. Expired entries must not come back from `get`; deleting them eventually is fine.

:::tip
slauth's own test suite runs every built-in store through the same contract tests (`src/stores/stores.test.js`). Copy it to test yours.
:::
