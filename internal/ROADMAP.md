# slauth roadmap (internal)

> Internal planning, not published on slauth.dev. If this repository goes public, so does
> this file: move it or trim it first.

**Where we are (2.0):** email codes, passkeys, providers (GitHub, Google, Discord, GitLab,
Microsoft, OIDC, custom OAuth 2), magic links, passwords, TOTP two-factor, sessions and
devices, roles and metadata, admin API, organizations with invitations, ES256 JWTs + JWKS,
events, per-IP rate limits, `<slauth-sign-in>` and `<slauth-account>`.

**What we're optimising for:** the five-minute start stays five minutes; every step deeper
is one config key; nothing a team would otherwise pay Clerk for is missing without a reason.

**How items are sized:** S = a day or two, M = about a week, L = several weeks.

## Now (2.1, next ~6 weeks)

| Item | Size | Why |
|---|---|---|
| **Independent security review** of `src/` | M | The biggest thing between "nice project" and "safe to recommend". Before any marketing push for 2.x. |
| **Sign in with Apple** | M | Most-asked provider after Google; needed for iOS apps. Needs `response_mode=form_post`, a cross-site POST callback (its own CSRF story), an ES256 client-secret JWT and ID-token checks against Apple's JWKS. |
| **QR code in `<slauth-account>`** for two-factor setup | S | Desktop users currently type the key. A ~3 kB QR encoder in `ui.js`, loaded only on that screen. |
| **Bot challenge hook** (Turnstile, hCaptcha) | S | `challenge: async (request, token) => boolean` checked on `email/start`, `password/signup` and `password/signin`. Cuts email-bombing and signup spam without fingerprinting. See the fingerprinting note below. |
| **"New sign-in" emails** | S | An email when a session starts from a browser or OS family that account hasn't used before. Uses data we already keep; opt-in. |
| **Postgres and libSQL stores** (Neon, Supabase, Hyperdrive, Turso) | S | The most common "my database isn't D1" request. Same contract tests. |

## Next (2.2 to 2.4)

| Item | Size | Why |
|---|---|---|
| **Auth for AI agents**: slauth as an OAuth 2.1 authorization server | L | 2026's real "agent" problem: people want AI agents (MCP clients, assistants) to act **for** a user with limited, revocable access. OAuth 2.1 with PKCE, dynamic client registration and consent screens, so a slauth app can protect an MCP server. Scoped tokens, a consent page in `<slauth-account>`, revocation in the device list. Big, but a clear differentiator. |
| **Personal API keys** | M | Scoped, hashed (`sk_…`), named, expiring keys for scripts and CLIs; listed and revoked in `<slauth-account>`. Also the simple version of "let my agent call my app". |
| **Signed webhooks** for events | M | `on` handlers run in-process; teams also want HMAC-signed HTTP deliveries with retries for `signUp`, `userDeleted` and the rest. |
| **`<slauth-admin>`** element | M | Users list with search, ban, delete, impersonate, sessions. The admin API exists; this is the "Clerk dashboard" moment for people without time to build one. Gated by `requireUser({ role })`. |
| **Active organization on the session** | S | `POST orgs/active`, `auth.session()` returns `orgId`, JWT carries `org_id` and `org_role`. |
| **Per-organization OIDC** ("sign in with your company's Okta") | M | Enterprise-lite without SAML: an org admin pastes an issuer, and members with that email domain go there. |
| **i18n** for elements and emails | S | Strings into one table; `lang` attribute; community translations. |
| **Thin React / Vue / Svelte wrappers** | S | Typed props and hooks (`useUser()`) around the elements and client. No new logic. |

## Later (3.0 territory)

- **Encryption at rest** for TOTP secrets and kept provider tokens, with key rotation
  (derive from `secret`, version the ciphertext).
- **Account recovery** beyond email: recovery contacts, admin-approved resets.
- **WebAuthn extras**: conditional UI everywhere, hybrid (phone-as-key) hints,
  attestation for orgs that need it.
- **SAML**, as a separate package (`slauthjs-saml`) so the core stays dependency-free.
- **SCIM** provisioning for organizations, same reasoning.
- **Audit log** (who did what, when) as an opt-in store prefix, readable via the admin API.

## Decisions

### Agent fingerprinting: not as fingerprinting

The question was whether slauth should fingerprint browsers or agents (canvas, fonts,
WebGL, TLS/JA4 and so on) to spot bots, AI agents or stolen sessions.

**Decision: no device fingerprinting in slauth.** Instead:

1. **Bots and abuse:** a challenge hook (above) for Turnstile or hCaptcha, plus the rate
   limits we have. Those vendors already do the fingerprinting, under their own privacy
   terms, and it's opt-in per app.
2. **Stolen sessions:** coarse signals we already store (user-agent family, IP from
   trusted headers) for "new sign-in" emails and, later, an opt-in `session.bind: 'ua'`
   that ends a session if its browser family changes. No hidden identifiers.
3. **AI agents acting for users:** give them their own front door (API keys, then OAuth
   2.1 scoped tokens) rather than trying to detect them. Agents that sign in like browsers
   can't be told apart reliably anyway, and good ones will use the door we give them.

**Why not fingerprint:**

- In the EU/UK it generally needs consent (ePrivacy treats reading device characteristics
  like cookies), which every slauth app would then need a banner for. That breaks the
  five-minute promise.
- It's an arms race slauth can't win as a library: headless browsers spoof it, and privacy
  browsers (Safari, Firefox, Brave) deliberately randomise it, so real users get flagged.
- It's a permanent identifier for people who never asked for one, in an auth library whose
  pitch is "your users, your database, nothing creepy".

Revisit if a large user asks with a concrete threat that the three answers above don't cover.

### Kept out on purpose

- **A hosted service.** slauth stays a library. A hosted dashboard would make it the
  thing it's an alternative to.
- **Dozens of built-in providers.** Five built in, plus `oidc()` and `oauth2()`. New
  built-ins only when they're popular *and* need special handling (like Apple).

## Watching

- npm downloads and GitHub stars after the 2.0 launch post.
- Which `rateLimit`, `freshMinutes` and provider questions come up in issues: they tell us
  where the defaults are wrong.
- Starlight and Astro majors (the site pins them; Dependabot opens the PRs).
