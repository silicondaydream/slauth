---
title: Users, roles and admin
description: Profiles, roles, metadata, and managing users from your server.
---

## What a user is

```ts
{
  id: 'usr_k3J…',
  email: 'me@example.com',
  name: 'Sam' | null,
  image: 'https://…' | null,
  roles: ['admin'],          // yours to set, on the server
  metadata: { plan: 'pro' }, // yours to set, on the server; the browser can see it
  createdAt: 1767225600000,
}
```

That's what `auth.user(request)`, the routes and your events get. On the server, `auth.users.get(id)` also has `privateMetadata` (never sent to the browser), `updatedAt` and `bannedAt`.

`name` and `image` are filled in from the first provider someone signs in with, and people can change them (`auth.user.update({ name })` in the browser). Anything bigger than a few fields belongs in your own tables, keyed by `user.id`.

## Roles

```js
await auth.users.update(user.id, { roles: ['admin'] })

const admin = await auth.requireUser(request, { role: 'admin' }) // or ['admin', 'staff']
if (admin instanceof Response) return admin // 401 signed out, 403 without the role
```

Roles are just strings. For roles *within* a team, see [Organizations](/docs/accounts/organizations/).

## The admin API

```js
await auth.users.get(id)
await auth.users.byEmail('me@example.com')
await auth.users.list({ limit: 100, cursor })     // → { users, cursor }
await auth.users.create({ email, name, roles, metadata, privateMetadata })
await auth.users.update(id, { email, name, image, roles, metadata, privateMetadata })
await auth.users.delete(id)
await auth.users.ban(id)
await auth.users.unban(id)

await auth.sessions.list(userId)                  // their devices
await auth.sessions.revoke(userId, sessionId)
await auth.sessions.revokeAll(userId)
await auth.accounts.list(userId)                  // linked providers
```

`users.create` skips the allow list: it's for imports and admin screens. `users.list` needs a store with `list()`, which all the built-in ones have.

Build your admin screen with these behind `requireUser(request, { role: 'admin' })`. slauth doesn't ship a dashboard; your app already has a UI.

### Banning

`ban(id)` signs them out everywhere and refuses every sign-in (`banned`) until `unban(id)`. Their data stays.

### Deleting

`delete(id)` removes the user, their email, sessions, passkeys, linked providers, password, two-factor and lock settings, and their organization memberships (an org whose only owner leaves gets a new owner: the longest-standing member). It fires `userDeleted` so you can clean up your own tables.

People can also delete their own account (`POST /auth/user/delete`, needing a [recent sign-in](/docs/accounts/sessions/#recent-sign-in)). Turn that off with `allowDeletion: false`.

### Changing someone's email

People do it themselves: `auth.email.change.start(newEmail)` sends a code to the new address, and `auth.email.change.verify(newEmail, code)` switches. As an admin: `auth.users.update(id, { email })`.

### Signing in as someone (impersonation)

To see what a user sees when they report a problem:

```js
const admin = await auth.requireUser(request, { role: 'admin' })
if (admin instanceof Response) return admin
const { cookie } = await auth.sessions.create(targetUserId, request, { impersonatorId: admin.id })
return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': cookie } })
```

That session shows up in their device list, and `GET /auth/session` and `auth.session(request)` report `impersonatorId`, so you can show a banner. `sessions.create` is also how you'd add your own sign-in method.
