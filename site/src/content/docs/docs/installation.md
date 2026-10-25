---
title: Installation
description: Install slauth and what each import is for.
---

```sh
npm install slauth      # or pnpm add / yarn add / bun add
```

On Deno: `import { slauth } from 'npm:slauth'`.

slauth has **no dependencies** and needs only Web standards: `fetch`, `Request`/`Response`, Web Crypto. That's every modern runtime: Cloudflare Workers, Bun 1+, Deno 1.40+, Node 20+, and the edge runtimes of Vercel and Netlify.

## Imports

| Import | What it is |
|---|---|
| `slauth` | `slauth()`, plus `memory()`, `consoleEmail()`, `createAccess`, `createLock` |
| `slauth/stores/d1` | Cloudflare D1 store |
| `slauth/stores/kv` | Cloudflare Workers KV store |
| `slauth/stores/sqlite` | SQLite store (bun:sqlite, better-sqlite3, node:sqlite) |
| `slauth/stores/memory` | In-memory store, for tests and trying things out |
| `slauth/email/resend` | Send codes with Resend |
| `slauth/email/cloudflare` | Send codes with Cloudflare Email Service |
| `slauth/email/console` | Print codes to the console (the default) |
| `slauth/client` | Browser helpers, including passkeys |
| `slauth/element` | The `<slauth-sign-in>` web component |
| `slauth/node` | `toNodeHandler()` for node:http and Express |

Each import is a separate file, so your bundle only includes what you use.
