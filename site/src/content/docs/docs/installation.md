---
title: Installation
description: Install slauth and what each import is for.
---

```sh
npm install slauthjs      # or pnpm add / yarn add / bun add
```

The package is called `slauthjs` on npm (the name `slauth` was taken); everything else, including the `slauth()` function, is plain slauth.

On Deno: `import { slauth } from 'npm:slauthjs'`.

slauth has **no dependencies** and needs only Web standards: `fetch`, `Request`/`Response`, Web Crypto. That's every modern runtime: Cloudflare Workers, Bun 1+, Deno 1.40+, Node 20+, and the edge runtimes of Vercel and Netlify.

## Imports

| Import | What it is |
|---|---|
| `slauthjs` | `slauth()`, plus `memory()`, `consoleEmail()`, `createAccess`, `createLock` |
| `slauthjs/stores/d1` | Cloudflare D1 store |
| `slauthjs/stores/kv` | Cloudflare Workers KV store |
| `slauthjs/stores/sqlite` | SQLite store (bun:sqlite, better-sqlite3, node:sqlite) |
| `slauthjs/stores/memory` | In-memory store, for tests and trying things out |
| `slauthjs/email/resend` | Send codes with Resend |
| `slauthjs/email/cloudflare` | Send codes with Cloudflare Email Service |
| `slauthjs/email/console` | Print codes to the console (the default) |
| `slauthjs/client` | Browser helpers, including passkeys |
| `slauthjs/element` | The `<slauth-sign-in>` web component |
| `slauthjs/node` | `toNodeHandler()` for node:http and Express |

Each import is a separate file, so your bundle only includes what you use.
