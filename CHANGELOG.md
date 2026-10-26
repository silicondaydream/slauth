# Changelog

## 2.0.0

slauth keeps its five-minute start and now goes as deep as a project needs. Everything
new is opt-in and still dependency-free.

### New

- **Sign in with providers** (`providers`): `github()`, `google()`, `discord()`, `gitlab()`,
  `microsoft()`, any OpenID Connect issuer with `oidc()`, or your own with `oauth2()`, from
  `slauthjs/providers`. PKCE, browser-bound state, account linking and unlinking, and
  sign-in by email only when the provider says it's verified.
- **Magic links** (`magicLinks`): a one-tap link in the code email, behind a click so mail
  scanners don't use it up.
- **Passwords** (`passwords`): PBKDF2-SHA256, email-verified sign-up, per-email lockout.
- **Two-factor** (`twoFactor`): TOTP with one-time recovery codes.
- **Tokens** (`tokens`): ES256 JWTs at `GET /auth/token`, public keys at `/auth/jwks.json`,
  `auth.createToken` / `auth.verifyToken`; `auth.user()` accepts them as bearer tokens.
- **Organizations** (`organizations`): owners, admins and custom roles, email invitations,
  `auth.orgs.require()`.
- **Users**: `name`, `image`, `roles`, `metadata` (public) and `privateMetadata`;
  `requireUser(request, { role })`; email change with a code; self-service deletion.
- **Admin API**: `auth.users.get/byEmail/list/create/update/delete/ban/unban`,
  `auth.sessions.list/revoke/revokeAll/create` (with `impersonatorId`), `auth.accounts.list`,
  `auth.session(request)`.
- **Sessions**: list your devices, sign one or all others out. Bearer session tokens for
  apps without cookies (`X-Slauth-Transport: bearer`, `createClient({ token })`).
- **Events** (`on`): `signUp`, `signIn`, `signOut`, `userUpdated`, `userDeleted`.
- **Custom emails** (`emails`), and senders now get `kind` and `link`.
- **Per-IP rate limits** (`rateLimit`) on code, password and two-factor routes.
- `allow(email, context)` now gets the sign-in method, provider and profile.
- `GET /auth/config` tells sign-in screens what's turned on.
- `<slauth-sign-in>` offers providers, passwords, sign-up (`mode="sign-up"`) and the
  two-factor step, and shows provider errors.
- `<slauth-account>` (`slauthjs/account`): profile, email, passkeys, password, providers,
  two-factor, devices, invitations, sign out and delete.
- `Store.list()` (optional) on every built-in store, for `auth.users.list()`.
- `baseUrl`, `signInPage`, `freshMinutes`, `allowDeletion` options.

### Changed

- **Adding a passkey now needs a recent sign-in** (15 minutes by default, `freshMinutes`),
  like setting a password, changing email, turning on two-factor, linking a provider and
  deleting the account. The sign-in box's passkey offer comes straight after sign-in, so
  it's unaffected; a settings-page "Add passkey" button may now get `reauth-required`.
  Set `freshMinutes: false` for the 1.x behaviour.
- Users carry more fields. Users stored by 1.x are read with defaults; nothing to migrate.
- `<slauth-sign-in>` without a bundler needs `ui.js` next to `element.js` and `client.js`.

## 1.0.0

Email codes, passkeys, sessions, stores (D1, SQLite, KV, memory), Resend and Cloudflare
Email senders, the client, `<slauth-sign-in>`, Cloudflare Access support and the PIN app lock.
