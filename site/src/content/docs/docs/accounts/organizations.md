---
title: Organizations
description: Teams with members, roles and email invitations.
---

```js
slauth({ ..., organizations: true })
// or
organizations: {
  allowCreate: (user) => user.roles.includes('paid'), // who may make one (default: anyone)
  invitePage: '/join',                                  // where invitation links go (default: signInPage, then "/")
}
```

An organization is whatever your app calls a team, workspace, family or club: `{ id, name, metadata, createdAt, createdBy }`, with members who each have a role.

## Roles

- **owner**: everything, including deleting the org and making other owners. There's always at least one.
- **admin**: renames the org, invites people, changes and removes members (but not owners).
- **anything else** (`member` by default; `billing`, `viewer`, …): a label your app gives meaning to.

## In the browser

```js
const { org } = await auth.orgs.create('Sloth Co')        // you're its owner
const { orgs } = await auth.orgs.list()                   // mine, with my role
const { members, invites } = await auth.orgs.get(org.id)  // invites only for owners and admins

await auth.orgs.invite(org.id, 'pal@example.com', 'admin')
await auth.orgs.setRole(org.id, userId, 'billing')
await auth.orgs.removeMember(org.id, userId)              // or your own id, to leave
await auth.orgs.rename(org.id, 'Sloth & Co')
await auth.orgs.delete(org.id)

const { invites } = await auth.orgs.invites()             // addressed to my email
await auth.orgs.accept(invites[0].id)
await auth.orgs.decline(invites[0].id)
```

## Invitations

Inviting someone emails them a link to `invitePage?slauth_invite=<id>`. They sign in **with that email address** (in any way), and:

- the [sign-in box](/docs/client/sign-in-element/) on that page accepts it as they sign in, or
- they'll find it in [`<slauth-account>`](/docs/client/account-element/), or your own UI via `auth.orgs.invites()`.

Invitations last 7 days and only work for the address they were sent to.

## Guarding your routes

```js
const member = await auth.orgs.require(request, orgId, { role: ['owner', 'admin'] })
if (member instanceof Response) return member // 401 signed out, 403 not a member / wrong role
member.orgRole // 'admin'
```

Keep the org's data in your own tables, keyed by `org.id`.

## On the server

`auth.orgs.create({ name }, ownerId)`, `get`, `update`, `delete`, `forUser(userId)`, `members(orgId)`, `role(orgId, userId)`, `addMember`, `setRole`, `removeMember`, `invite` (saves without emailing) and `revokeInvite`.

Not built in: an "active organization" on the session (put the org id in your URLs, `/o/<orgId>/…`), SAML/SSO per organization, or SCIM.
