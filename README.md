# slauth 🦥

**Auth for side projects.** Email codes and passkeys in five minutes, in your own database,
on whatever you deploy to. Zero dependencies, about 29 kB.

Sturdier than a password in an env var, and a lot less fuss than a hosted auth company.

```js
import { slauth } from 'slauthjs'
import { d1 } from 'slauthjs/stores/d1'
import { resend } from 'slauthjs/email/resend'

const auth = slauth({
  secret: env.SLAUTH_SECRET,
  store: d1(env.DB),
  email: resend({ apiKey: env.RESEND_API_KEY, from: 'My App <hi@myapp.dev>' }),
})

if (url.pathname.startsWith('/auth/')) return auth.handle(request)
const user = await auth.user(request) // { id, email, createdAt } or null
```

```html
<script type="module">import 'slauthjs/element'</script>
<slauth-sign-in app-name="My App" redirect="/"></slauth-sign-in>
```

- **Email codes**: 6 digits, 10 minutes, 5 tries, stored as an HMAC.
- **Passkeys**: WebAuthn (ES256 + RS256) checked with Web Crypto, no libraries.
- **Your database**: D1, SQLite (bun:sqlite, node:sqlite, better-sqlite3), Workers KV, memory, or any `get`/`put`/`delete`.
- **Runs anywhere** with `Request`/`Response`: Cloudflare Workers, Bun, Deno, Node, Next.js, Astro, Hono.
- **Extras**: an allow list (`['me@example.com', '@family.com']`), an optional PIN app lock, and Cloudflare Access support.

📖 **Docs: [slauth.dev/docs](https://slauth.dev/docs/)**: [quickstart](https://slauth.dev/docs/quickstart/), [frameworks](https://slauth.dev/docs/frameworks/cloudflare-workers/), [security](https://slauth.dev/docs/concepts/security/).

## Examples

- [`examples/workers-d1`](examples/workers-d1): Cloudflare Workers + D1, with the sign-in box
- [`examples/bun-sqlite`](examples/bun-sqlite): Bun + bun:sqlite
- [`examples/node-express`](examples/node-express): Express + node:sqlite

## Not for

Enterprise SSO/SAML, orgs and roles, or dozens of OAuth providers. For those, see
[the comparison](https://slauth.dev/compare).

## Repository

| | |
|---|---|
| `src/` | the library (plain ESM + `.d.ts`) |
| `test/` | test helpers, a simulated passkey authenticator, type checks, a browser test |
| `examples/` | runnable apps |
| `site/` | slauth.dev: Astro marketing pages + Starlight docs |

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
