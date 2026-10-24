# slauth 🦥

One sign-in for a small suite of Cloudflare Workers apps, plus a PIN lock that asks
again only as often as each person wants.

- **Who you are** comes from [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
  (free for up to 50 people). It shows a login page (email code or Google), keeps an
  allow-list of emails, and lets one sign-in cover every app in your Access team.
  slauth checks the signed token Access attaches to each request.
- **Is it still you holding the phone?** That part is the app lock. It's a 4-digit PIN,
  set per person and per app, and it asks again `always`, `daily`, `weekly` or `never`.
  Each person picks the setting in that app's Settings.

Each person gets the same opaque `userId` in every app (derived from their email), so
the apps agree on who is who without sharing a database.

No dependencies. Uses Web Crypto only, so it runs on Workers, in Node 20+ and in tests.

## Install

```sh
pnpm add github:silicondaydream/slauth   # or npm install github:silicondaydream/slauth
```

## Use

```js
import { createAccess, createLock } from 'slauth'

const access = createAccess({
  teamDomain: env.ACCESS_TEAM,        // "yourteam" → yourteam.cloudflareaccess.com
  audience: env.ACCESS_AUD,           // the Access application's AUD tag
  devUser: env.DEV_USER,              // local dev only, never in production
})

// Where each person's lock lives: any { get(userId), put(userId, doc) }.
const lock = createLock(
  {
    get: async (userId) => JSON.parse((await env.DB.prepare('SELECT value FROM docs WHERE key = ?').bind(`lock:${userId}`).first('value')) ?? 'null'),
    put: async (userId, doc) => { /* upsert `lock:${userId}` */ },
  },
  { cookie: 'myapp_session', defaultPolicy: 'weekly' },
)

export default {
  async fetch(request, env) {
    const user = await access.getUser(request)
    if (!user) return new Response('Sign in through Access.', { status: 401 })

    const url = new URL(request.url)
    const cookie = request.headers.get('cookie')
    const secure = url.protocol === 'https:'

    // /api/lock/session, /api/lock/login, /setup, /logout, /pin, /policy
    if (url.pathname.startsWith('/api/lock/')) {
      const reply = await lock.handle(url.pathname.slice(10), request.method, () => request.json(), user, cookie, secure)
      if (reply) {
        const res = Response.json(reply.body, { status: reply.status })
        if (reply.cookie) res.headers.append('Set-Cookie', reply.cookie)
        return res
      }
    }

    if (!(await lock.isUnlocked(user, cookie))) return Response.json({ error: 'Locked.' }, { status: 401 })
    // ... the app, with data scoped to user.userId
  },
}
```

### Lock routes

| Route | Body | What it does |
|---|---|---|
| `GET session` | | `{ email, policy, required, pinSet, unlocked }` |
| `POST setup` | `{ pin, policy? }` or `{ policy: "never" }` | first visit: create a PIN, or choose none |
| `POST login` | `{ pin }` | unlock; 5 free tries, then 5 min doubling to 1 h |
| `POST logout` | | lock this device now |
| `POST pin` | `{ current, next }` | change PIN; locks this person's other devices |
| `POST policy` | `{ policy, pin }` | change how often to ask; needs the current PIN |

Making a policy stricter also applies to unlocks that were already handed out. If
someone switches from weekly to daily, a 3-day-old unlock stops counting right away.

PIN documents from the earlier single-user apps (`{ pinHash, salt, sessionKey, … }`)
load as they are, so an existing PIN keeps working.

## Setting up Cloudflare Access

1. **Zero Trust → Settings → Authentication.** Add a login method. One-time PIN (email)
   is on by default; Google is a few clicks. Branding is under **Settings → Custom pages**.
2. **Zero Trust → Access → Applications → Add → Self-hosted.** Add each app's hostname
   to one application, or create one application per app. Set **Session duration**
   (e.g. 1 month).
   - On `workers.dev`, you can also turn on Access from the Worker's **Settings →
     Domains & Routes**. A custom domain (e.g. `ledgerfox.example.com`) keeps things
     simpler.
3. **Policy:** Allow, with *Emails* set to exactly the people who should get in.
4. Copy the application's **Application Audience (AUD) tag**. Set it on each Worker as
   `ACCESS_AUD`, and set your team name (the part before `.cloudflareaccess.com`) as
   `ACCESS_TEAM`.
5. Make sure every route to the Worker goes through Access, including `workers.dev`
   and preview URLs. A request that skips Access has no valid token, so slauth refuses
   it. You'll get a 401 instead of a data leak.

## Develop

```sh
pnpm install
pnpm test
```

## Ideas for later

- Passkeys (WebAuthn) as an unlock instead of, or alongside, the PIN.
- A standalone sign-in Worker (passkeys + email link) that can stand in for Access.
- Shared "spaces" so a household can share a budget or a list.
