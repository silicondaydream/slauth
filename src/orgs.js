import { randomId } from './util.js'
import { normalizeEmail } from './users.js'

const INVITE_DAYS = 7
/** Roles that can manage an organization. Any other role string is just a label for your app. */
const MANAGERS = new Set(['owner', 'admin'])

/**
 * Organizations (teams, workspaces, families: whatever your app calls them).
 *
 *   org:<orgId>         { id, name, metadata, createdAt, createdBy }
 *   members:<orgId>     [{ userId, role, joinedAt }]
 *   orgs:<userId>       [orgId, ...]
 *   invite:<inviteId>   { id, orgId, email, role, invitedBy, createdAt, expiresAt }
 *   invites:<email>     [inviteId, ...]
 *   org-invites:<orgId> [inviteId, ...]
 *
 * Roles: "owner" (everything, including deleting the org), "admin" (members and
 * invitations), and anything else you like ("member", "billing", "viewer").
 *
 * @param {import('./index.js').Store} store
 */
export function createOrgs(store) {
  const list = async (key) => (await store.get(key)) ?? []
  const save = async (key, items) => (items.length ? store.put(key, items) : store.delete(key))

  async function get(orgId) {
    return typeof orgId === 'string' ? store.get(`org:${orgId}`) : null
  }

  async function members(orgId) {
    return list(`members:${orgId}`)
  }

  async function role(orgId, userId) {
    return (await members(orgId)).find((m) => m.userId === userId)?.role ?? null
  }

  async function addMember(orgId, userId, memberRole = 'member') {
    const current = await members(orgId)
    if (current.some((m) => m.userId === userId)) return setRole(orgId, userId, memberRole)
    await store.put(`members:${orgId}`, [...current, { userId, role: memberRole, joinedAt: Date.now() }])
    const mine = await list(`orgs:${userId}`)
    if (!mine.includes(orgId)) await store.put(`orgs:${userId}`, [...mine, orgId])
    return true
  }

  async function setRole(orgId, userId, memberRole) {
    const current = await members(orgId)
    const member = current.find((m) => m.userId === userId)
    if (!member) return false
    if (member.role === 'owner' && memberRole !== 'owner' && current.filter((m) => m.role === 'owner').length === 1) {
      throw new OrgError('An organization needs at least one owner.', 'last-owner')
    }
    await store.put(`members:${orgId}`, current.map((m) => (m.userId === userId ? { ...m, role: memberRole } : m)))
    return true
  }

  async function removeMember(orgId, userId) {
    const current = await members(orgId)
    const member = current.find((m) => m.userId === userId)
    if (!member) return false
    if (member.role === 'owner' && current.filter((m) => m.role === 'owner').length === 1 && current.length > 1) {
      throw new OrgError('Make someone else an owner first.', 'last-owner')
    }
    await save(`members:${orgId}`, current.filter((m) => m.userId !== userId))
    await save(`orgs:${userId}`, (await list(`orgs:${userId}`)).filter((id) => id !== orgId))
    // The last person out turns off the lights.
    if (current.length === 1) await remove(orgId)
    return true
  }

  async function remove(orgId) {
    for (const m of await members(orgId)) await save(`orgs:${m.userId}`, (await list(`orgs:${m.userId}`)).filter((id) => id !== orgId))
    for (const id of await list(`org-invites:${orgId}`)) await revokeInvite(id)
    await store.delete(`members:${orgId}`)
    await store.delete(`org-invites:${orgId}`)
    await store.delete(`org:${orgId}`)
  }

  async function invite(orgId, email, memberRole = 'member', invitedBy = null) {
    const to = normalizeEmail(email)
    const id = randomId('inv')
    const now = Date.now()
    const doc = { id, orgId, email: to, role: memberRole, invitedBy, createdAt: now, expiresAt: now + INVITE_DAYS * 86_400_000 }
    await store.put(`invite:${id}`, doc, { ttl: INVITE_DAYS * 86_400 })
    await store.put(`invites:${to}`, [...(await list(`invites:${to}`)), id])
    await store.put(`org-invites:${orgId}`, [...(await list(`org-invites:${orgId}`)), id])
    return doc
  }

  async function revokeInvite(inviteId) {
    const doc = typeof inviteId === 'string' ? await store.get(`invite:${inviteId}`) : null
    if (!doc) return false
    await store.delete(`invite:${inviteId}`)
    await save(`invites:${doc.email}`, (await list(`invites:${doc.email}`)).filter((id) => id !== inviteId))
    await save(`org-invites:${doc.orgId}`, (await list(`org-invites:${doc.orgId}`)).filter((id) => id !== inviteId))
    return true
  }

  async function live(ids) {
    const out = []
    for (const id of ids) {
      const doc = await store.get(`invite:${id}`)
      if (doc && doc.expiresAt > Date.now()) out.push(doc)
    }
    return out
  }

  return {
    get,
    members,
    role,
    addMember,
    setRole,
    removeMember,
    remove,
    invite,
    revokeInvite,

    async create({ name, metadata = {} }, ownerId) {
      const org = { id: randomId('org'), name: String(name).trim().slice(0, 100), metadata, createdAt: Date.now(), createdBy: ownerId ?? null }
      await store.put(`org:${org.id}`, org)
      if (ownerId) await addMember(org.id, ownerId, 'owner')
      return org
    },

    async update(orgId, patch) {
      const org = await get(orgId)
      if (!org) return null
      const next = { ...org }
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim().slice(0, 100)
      if (patch.metadata !== undefined) next.metadata = patch.metadata
      await store.put(`org:${orgId}`, next)
      return next
    },

    /** The organizations someone belongs to, each with their role. */
    async forUser(userId) {
      const out = []
      for (const id of await list(`orgs:${userId}`)) {
        const org = await get(id)
        const r = org && (await role(id, userId))
        if (r) out.push({ ...org, role: r })
      }
      return out
    },

    invitesFor: async (email) => live(await list(`invites:${normalizeEmail(email)}`)),
    invitesOf: async (orgId) => live(await list(`org-invites:${orgId}`)),
    getInvite: async (inviteId) => (typeof inviteId === 'string' ? store.get(`invite:${inviteId}`) : null),

    /** Accepts an invitation addressed to this user's email. */
    async accept(inviteId, user) {
      const doc = typeof inviteId === 'string' ? await store.get(`invite:${inviteId}`) : null
      if (!doc || doc.email !== user.email || doc.expiresAt <= Date.now() || !(await get(doc.orgId))) return null
      await addMember(doc.orgId, user.id, doc.role)
      await revokeInvite(inviteId)
      return doc
    },

    /** Called when a user is deleted. */
    async forget(userId) {
      for (const id of await list(`orgs:${userId}`)) {
        const current = await members(id)
        const rest = current.filter((m) => m.userId !== userId)
        // Hand ownership on to the longest-standing member rather than leave it ownerless.
        if (rest.length && !rest.some((m) => m.role === 'owner')) rest[0] = { ...rest[0], role: 'owner' }
        if (rest.length) await store.put(`members:${id}`, rest)
        else await remove(id)
      }
      await store.delete(`orgs:${userId}`)
    },

    canManage: (memberRole) => MANAGERS.has(memberRole),
  }
}

export class OrgError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}
