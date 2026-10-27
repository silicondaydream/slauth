import { normalizeEmail, publicUser, validEmail } from '../users.js'
import { json, withParams } from '../util.js'

const ROLE = /^[a-z0-9_-]{1,40}$/i

/**
 * Organizations, when `organizations` is on. Everything here is for signed-in people.
 *
 *   GET  orgs                              → { orgs }   mine, each with my role
 *   POST orgs                  { name }    → { org }    I'm its owner
 *   GET  orgs/<id>                         → { org, role, members, invites? }
 *   POST orgs/<id>             { name }    rename (owner, admin)
 *   POST orgs/<id>/delete                  (owner)
 *   POST orgs/<id>/invite      { email, role? }   (owner, admin)
 *   POST orgs/<id>/invites/revoke   { id }        (owner, admin)
 *   POST orgs/<id>/members/role     { userId, role }   (owner, admin; only owners make owners)
 *   POST orgs/<id>/members/remove   { userId }   (owner, admin, or yourself to leave)
 *   GET  invites                           → { invites }   addressed to my email
 *   POST invites/accept        { id }
 *   POST invites/decline       { id }
 *
 * @param {object} app  the shared context from core.js
 */
export function orgRoutes(app) {
  const { orgs, users } = app
  const forbidden = () => json({ error: "You don't have access to that.", code: 'forbidden' }, 403)
  const notFound = () => json({ error: 'No such organization.', code: 'not-found' }, 404)

  return async function route({ route, method, request, url, body }) {
    if (!(route === 'orgs' || route.startsWith('orgs/') || route === 'invites' || route.startsWith('invites/'))) return
    if (!orgs) return json({ error: 'Organizations are turned off.', code: 'not-found' }, 404)
    const me = await app.signedIn(request)
    if (me instanceof Response) return me
    const { user } = me

    if (route === 'orgs' && method === 'GET') return json({ orgs: await orgs.forUser(user.id) })

    if (route === 'orgs' && method === 'POST') {
      const allowCreate = app.orgOptions.allowCreate
      if (allowCreate === false || (typeof allowCreate === 'function' && !(await allowCreate(publicUser(user))))) return forbidden()
      const { name } = await body()
      if (typeof name !== 'string' || !name.trim()) return json({ error: 'Give it a name.', code: 'bad-request' }, 400)
      const org = await orgs.create({ name }, user.id)
      return json({ org: { ...org, role: 'owner' } })
    }

    if (route === 'invites' && method === 'GET') {
      const out = []
      for (const invite of await orgs.invitesFor(user.email)) {
        const org = await orgs.get(invite.orgId)
        if (org) out.push({ id: invite.id, role: invite.role, org: { id: org.id, name: org.name }, expiresAt: invite.expiresAt })
      }
      return json({ invites: out })
    }

    if (route === 'invites/accept' && method === 'POST') {
      const accepted = await orgs.accept((await body()).id, user)
      if (!accepted) return json({ error: "That invitation has expired or isn't for you.", code: 'not-found' }, 404)
      return json({ ok: true, org: { ...(await orgs.get(accepted.orgId)), role: accepted.role } })
    }

    if (route === 'invites/decline' && method === 'POST') {
      const invite = await orgs.getInvite((await body()).id)
      if (!invite || invite.email !== user.email) return json({ error: 'No such invitation.', code: 'not-found' }, 404)
      await orgs.revokeInvite(invite.id)
      return json({ ok: true })
    }

    const [, orgId, ...rest] = route.split('/')
    const action = rest.join('/')
    const org = await orgs.get(orgId)
    const role = org && (await orgs.role(orgId, user.id))
    if (!org || !role) return notFound()
    const manager = orgs.canManage(role)

    if (action === '' && method === 'GET') {
      const members = []
      for (const m of await orgs.members(orgId)) {
        const u = await users.byId(m.userId)
        if (u) members.push({ userId: m.userId, role: m.role, joinedAt: m.joinedAt, email: u.email, name: u.name, image: u.image })
      }
      const out = { org, role, members }
      if (manager) out.invites = (await orgs.invitesOf(orgId)).map(({ id, email, role: r, createdAt, expiresAt }) => ({ id, email, role: r, createdAt, expiresAt }))
      return json(out)
    }

    if (method !== 'POST') return
    const input = await body()

    if (action === '') {
      if (!manager) return forbidden()
      return json({ org: await orgs.update(orgId, { name: input.name }) })
    }

    if (action === 'delete') {
      if (role !== 'owner') return forbidden()
      await orgs.remove(orgId)
      return json({ ok: true })
    }

    if (action === 'invite') {
      if (!manager) return forbidden()
      const email = normalizeEmail(input.email)
      const inviteRole = input.role ?? 'member'
      if (!validEmail(email)) return json({ error: "That doesn't look like an email address.", code: 'bad-email' }, 400)
      if (!ROLE.test(inviteRole)) return json({ error: 'Roles are letters, digits, dashes and underscores.', code: 'bad-request' }, 400)
      if (inviteRole === 'owner' && role !== 'owner') return forbidden()
      const existing = await users.byEmail(email)
      if (existing && (await orgs.role(orgId, existing.id))) return json({ error: "They're already a member.", code: 'already-member' }, 409)
      const invite = await orgs.invite(orgId, email, inviteRole, user.id)
      const link = `${app.origin(url)}${withParams(app.orgOptions.invitePage ?? app.signInPage ?? '/', { slauth_invite: invite.id })}`
      await app.codes.send({ kind: 'invite', to: email, link, orgName: org.name, inviter: user.name ?? user.email })
      return json({ ok: true, invite: { id: invite.id, email, role: inviteRole, expiresAt: invite.expiresAt } })
    }

    if (action === 'invites/revoke') {
      if (!manager) return forbidden()
      const invite = await orgs.getInvite(input.id)
      if (!invite || invite.orgId !== orgId) return json({ error: 'No such invitation.', code: 'not-found' }, 404)
      await orgs.revokeInvite(invite.id)
      return json({ ok: true })
    }

    if (action === 'members/role') {
      if (!manager) return forbidden()
      if (typeof input.role !== 'string' || !ROLE.test(input.role)) return json({ error: 'Roles are letters, digits, dashes and underscores.', code: 'bad-request' }, 400)
      const theirs = await orgs.role(orgId, input.userId)
      if (!theirs) return json({ error: "They're not a member.", code: 'not-found' }, 404)
      // Only owners can make owners, or change what an owner is.
      if ((input.role === 'owner' || theirs === 'owner') && role !== 'owner') return forbidden()
      await orgs.setRole(orgId, input.userId, input.role)
      return json({ ok: true })
    }

    if (action === 'members/remove') {
      const self = input.userId === user.id
      const theirs = await orgs.role(orgId, input.userId)
      if (!theirs) return json({ error: "They're not a member.", code: 'not-found' }, 404)
      if (!self && (!manager || (theirs === 'owner' && role !== 'owner'))) return forbidden()
      await orgs.removeMember(orgId, input.userId)
      return json({ ok: true })
    }
  }
}
