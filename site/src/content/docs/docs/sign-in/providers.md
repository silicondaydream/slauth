---
title: Sign in with GitHub, Google & co.
description: OAuth 2.0 and OpenID Connect providers, with PKCE, account linking and no dependencies.
---

```js
import { github, google } from 'slauthjs/providers'

const auth = slauth({
  secret, store, email,
  providers: [
    github({ clientId: env.GITHUB_ID, clientSecret: env.GITHUB_SECRET }),
    google({ clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET }),
  ],
})
```

That's it. [The sign-in box](/docs/client/sign-in-element/) shows a "Continue with GitHub" button for each provider, or link to one yourself:

```html
<a href="/auth/oauth/github?redirect=/dashboard">Continue with GitHub</a>
```

When you register your app with the provider, the **callback URL** is:

```
https://your-site/auth/oauth/<provider id>/callback
```

Behind a proxy, or with more than one domain, set [`baseUrl`](/docs/configuration/#baseurl) so slauth builds that URL with the right address.

## Built-in providers

| | Where to make the app | Notes |
|---|---|---|
| `github()` | github.com/settings/developers | Uses the verified primary email, not the public profile one. |
| `google()` | console.cloud.google.com → Credentials | |
| `discord()` | discord.com/developers/applications | |
| `gitlab({ baseUrl? })` | gitlab.com → Applications | Self-hosted GitLab with `baseUrl`. |
| `microsoft({ tenant? })` | Entra ID → App registrations | See the note on emails below. |
| `oidc({ id, name, issuer })` | anything OpenID Connect | Auth0, Okta, Keycloak, Authentik, Zitadel… found from the issuer's discovery document. |

Each takes `{ clientId, clientSecret, scope?, params?, trustEmail?, keepTokens? }`.

## Any other OAuth provider

```js
import { oauth2 } from 'slauthjs/providers'

const twitch = oauth2({
  id: 'twitch',
  name: 'Twitch',
  clientId: env.TWITCH_ID,
  clientSecret: env.TWITCH_SECRET,
  authorization: 'https://id.twitch.tv/oauth2/authorize',
  token: 'https://id.twitch.tv/oauth2/token',
  scope: 'user:read:email',
  async profile(tokens, fetch) {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'Client-Id': env.TWITCH_ID },
    })
    const [me] = (await res.json()).data
    return { id: me.id, email: me.email, emailVerified: Boolean(me.email), name: me.display_name, image: me.profile_image_url }
  },
})
```

`tokenAuth: 'basic'` sends the client secret as HTTP Basic instead of in the body, for providers that want that. `pkce: false` for the rare provider that chokes on PKCE.

## Who is it?

When someone comes back from a provider, slauth decides who they are, in this order:

1. Someone who **linked this provider account before** → that user.
2. A signed-in person **linking** it (`?link=1`) → them.
3. The user with **the same email**, if the provider says the email is **verified** → them, and the provider is linked.
4. Otherwise a **new user**, if the [allow list](/docs/configuration/#allow) agrees.

Step 3 is why the verified flag matters: without it, anyone could make a provider account with your email and walk into your slauth account. Providers that don't say whether an email is verified get `email-not-verified` instead. If you really do trust a provider's emails (say, your company's own identity provider), set `trustEmail: true`.

**Microsoft:** a work or school account's email isn't promised to belong to the person, so only personal Microsoft accounts count as verified. With a single `tenant` you control, `trustEmail: true` is fine.

The allow list's function form gets the provider and profile, so you can be stricter for providers:

```js
allow: (email, { method, provider }) => method !== 'oauth' || email.endsWith('@mycompany.com')
```

## Linking and unlinking

People who are signed in can connect more providers, so they can sign in either way:

```js
auth.oauth.link('github', { redirect: '/settings' }) // from slauthjs/client
// or <a href="/auth/oauth/github?link=1&redirect=/settings">
```

They come back to `/settings?slauth_linked=github`. Linking needs a [recent sign-in](/docs/accounts/sessions/#recent-sign-in). `auth.accounts.unlink('github')` disconnects. The [account element](/docs/client/account-element/) does both.

## Calling the provider's API

Set `keepTokens: true` on a provider to keep its access and refresh tokens:

```js
const [github] = (await auth.accounts.list(user.id)).filter((a) => a.provider === 'github')
await fetch('https://api.github.com/user/repos', { headers: { Authorization: `Bearer ${github.tokens.access_token}` } })
```

They're stored as the provider gave them (not encrypted), and slauth doesn't refresh them for you.

## When something goes wrong

The person is sent back to the page they started on (or [`signInPage`](/docs/configuration/#signinpage)) with `?slauth_error=<code>`, which the sign-in box shows as a message:

| Code | |
|---|---|
| `oauth-cancelled` | They said no at the provider. |
| `oauth-failed` | The provider wouldn't swap the code for a token, or gave no profile. |
| `oauth-state` | The sign-in took over 10 minutes, or was started in another browser. |
| `email-not-verified` | No verified email to sign in with. |
| `not-allowed` | The allow list said no. |
| `account-in-use` | Linking an account that belongs to someone else. |
| `banned` | That user is [banned](/docs/accounts/users/#banning). |

## What slauth checks

- **PKCE** (S256) on every flow, and a random `state` stored server-side for 10 minutes and used once.
- The `state` must match a short-lived `HttpOnly` cookie, so nobody can finish a sign-in someone else started (login CSRF).
- The profile comes from the provider's API using the token slauth just got over TLS, so there's no ID token to forge.
- `redirect` must be a path on your site: `//evil.example` and full URLs are ignored.
- If the person has [two-factor](/docs/sign-in/two-factor/) on, they still need their code.

Not built in yet: Apple (which posts back cross-site and needs a signed client secret).
