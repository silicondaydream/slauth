# slauth 🦥

**Open-source auth you own.** Email codes and passkeys in five minutes, in your own database,
on whatever you deploy to. Then, when the side project grows up: "Sign in with GitHub",
passwords, two-factor, organizations, an admin API and JWTs, one config key at a time.
Zero dependencies.

Like Auth.js meets a free Clerk, with the simplicity turned all the way up.

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
const user = await auth.user(request) // { id, email, name, image, roles, metadata, createdAt } or null
```

```html
<script type="module">import 'slauthjs/element'</script>
<slauth-sign-in app-name="My App" redirect="/"></slauth-sign-in>
```

## Out of the box

- **Email codes**: 6 digits, 10 minutes, 5 tries, stored as an HMAC.
- **Passkeys**: WebAuthn (ES256 + RS256) checked with Web Crypto, no libraries.
- **Your database**: D1, SQLite (bun:sqlite, node:sqlite, better-sqlite3), Workers KV, memory, or any `get`/`put`/`delete`.
- **Runs anywhere** with `Request`/`Response`: Cloudflare Workers, Bun, Deno, Node, Next.js, Astro, Hono.
- **Sessions** that people can see and revoke, per-IP rate limits, CSRF protection.

## When you need more

Every one of these is off until you turn it on:

```js
import { github, google, oidc } from 'slauthjs/providers'

slauth({
  ...,
  providers: [github({ clientId, clientSecret }), google({ clientId, clientSecret }), oidc({ id: 'okta', name: 'Okta', issuer, clientId })],
  magicLinks: true,     // a one-tap link in the code email
  passwords: true,      // optional, and only after proving the email
  twoFactor: true,      // authenticator apps + recovery codes
  organizations: true,  // teams, roles, email invitations
  tokens: true,         // ES256 JWTs + /auth/jwks.json for your other services
  on: { signUp: ({ user }) => createProfile(user.id) },
})
```

| | |
|---|---|
| **Providers** | GitHub, Google, Discord, GitLab, Microsoft, any OpenID Connect issuer, or a custom `oauth2()`. PKCE, account linking, verified emails only. |
| **Passwords** | PBKDF2 via Web Crypto. "Forgot password" is just an email code. |
| **Two-factor** | TOTP (RFC 6238) with one-time recovery codes. Passkeys skip it. |
| **Users** | Names, pictures, roles, public and private metadata, email change, self-service deletion. `requireUser(request, { role: 'admin' })`. |
| **Admin API** | `auth.users.list/create/update/delete/ban`, `auth.sessions.revokeAll`, impersonation. |
| **Organizations** | Owners, admins and your own roles; invitations by email; `auth.orgs.require(request, orgId)`. |
| **Apps without cookies** | Bearer session tokens for mobile apps and CLIs. |
| **UI** | `<slauth-sign-in>` offers whatever's on; `<slauth-account>` is a whole account page in one tag. |

📖 **Docs: [slauth.dev/docs](https://slauth.dev/docs/)**: [quickstart](https://slauth.dev/docs/quickstart/), [providers](https://slauth.dev/docs/sign-in/providers/), [frameworks](https://slauth.dev/docs/frameworks/cloudflare-workers/), [security](https://slauth.dev/docs/concepts/security/). What changed: [CHANGELOG.md](CHANGELOG.md).

## Examples

- [`examples/workers-d1`](examples/workers-d1): Cloudflare Workers + D1, with the sign-in box
- [`examples/bun-sqlite`](examples/bun-sqlite): Bun + bun:sqlite
- [`examples/node-express`](examples/node-express): Express + node:sqlite

## Not for

SAML, SCIM, per-organization SSO, or a hosted dashboard you didn't build. For those, see
[the comparison](https://slauth.dev/compare).

## Repository

| | |
|---|---|
| `src/` | the library (plain ESM + `.d.ts`) |
| `test/` | test helpers, a simulated passkey authenticator, type checks, a browser test |
| `examples/` | runnable apps |
| `site/` | slauth.dev: Astro marketing pages + Starlight docs |

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_POLICY.md](CODE_POLICY.md). Security
reports: [SECURITY.md](SECURITY.md). MIT licensed.
