import { afterEach, describe, expect, it, vi } from 'vitest'
import { setup, signIn } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

async function team() {
  vi.useFakeTimers({ toFake: ['Date'] })
  const ctx = setup({ organizations: true, signInPage: '/login' })
  const owner = ctx.browser()
  const ownerUser = (await signIn(owner, ctx.mailbox, 'owner@example.com')).body.user
  const org = (await owner.call('POST', '/auth/orgs', { name: 'Sloth Co' })).body.org
  return { ...ctx, owner, ownerUser, org }
}

/** Invites `email`, then signs them in and accepts. */
async function join(ctx, email, role) {
  const invited = await ctx.owner.call('POST', `/auth/orgs/${ctx.org.id}/invite`, { email, role })
  const b = ctx.browser()
  const user = (await signIn(b, ctx.mailbox, email)).body.user
  await b.call('POST', '/auth/invites/accept', { id: invited.body.invite.id })
  return { b, user }
}

describe('organizations', () => {
  it('whoever makes one owns it', async () => {
    const { owner, org } = await team()
    expect(org).toMatchObject({ name: 'Sloth Co', role: 'owner' })
    expect((await owner.call('GET', '/auth/orgs')).body.orgs).toMatchObject([{ id: org.id, role: 'owner' }])
  })

  it('invites by email; the invitee sees it after signing in and joins', async () => {
    const ctx = await team()
    const invited = await ctx.owner.call('POST', `/auth/orgs/${ctx.org.id}/invite`, { email: 'Pal@Example.com', role: 'admin' })
    expect(invited.status).toBe(200)
    const email = ctx.mailbox.at(-1)
    expect(email).toMatchObject({ to: 'pal@example.com', kind: 'invite' })
    expect(email.link).toBe(`https://app.example/login?slauth_invite=${invited.body.invite.id}`)
    expect(email.subject).toContain('Sloth Co')

    const pal = ctx.browser()
    await signIn(pal, ctx.mailbox, 'pal@example.com')
    const { invites } = (await pal.call('GET', '/auth/invites')).body
    expect(invites).toMatchObject([{ role: 'admin', org: { name: 'Sloth Co' } }])
    await pal.call('POST', '/auth/invites/accept', { id: invites[0].id })
    const detail = (await pal.call('GET', `/auth/orgs/${ctx.org.id}`)).body
    expect(detail.role).toBe('admin')
    expect(detail.members.map((m) => [m.email, m.role])).toEqual([
      ['owner@example.com', 'owner'],
      ['pal@example.com', 'admin'],
    ])
    expect((await pal.call('GET', '/auth/invites')).body.invites).toEqual([])
  })

  it("an invitation only works for the email it's addressed to", async () => {
    const ctx = await team()
    const invited = await ctx.owner.call('POST', `/auth/orgs/${ctx.org.id}/invite`, { email: 'pal@example.com' })
    const stranger = ctx.browser()
    await signIn(stranger, ctx.mailbox, 'stranger@example.com')
    expect((await stranger.call('POST', '/auth/invites/accept', { id: invited.body.invite.id })).status).toBe(404)
    expect((await stranger.call('GET', `/auth/orgs/${ctx.org.id}`)).status).toBe(404)
  })

  it('members can see, admins can manage, only owners make owners', async () => {
    const ctx = await team()
    const member = await join(ctx, 'm@example.com')
    const admin = await join(ctx, 'a@example.com', 'admin')
    const id = ctx.org.id
    expect((await member.b.call('POST', `/auth/orgs/${id}/invite`, { email: 'x@example.com' })).status).toBe(403)
    expect((await member.b.call('GET', `/auth/orgs/${id}`)).body.invites).toBeUndefined()
    expect((await admin.b.call('POST', `/auth/orgs/${id}/members/role`, { userId: member.user.id, role: 'billing' })).status).toBe(200)
    expect((await admin.b.call('POST', `/auth/orgs/${id}/members/role`, { userId: member.user.id, role: 'owner' })).status).toBe(403)
    expect((await admin.b.call('POST', `/auth/orgs/${id}/members/remove`, { userId: ctx.ownerUser.id })).status).toBe(403)
    expect((await admin.b.call('POST', `/auth/orgs/${id}/delete`, {})).status).toBe(403)
    expect((await ctx.owner.call('POST', `/auth/orgs/${id}/members/role`, { userId: admin.user.id, role: 'owner' })).status).toBe(200)
  })

  it('keeps at least one owner', async () => {
    const ctx = await team()
    await join(ctx, 'm@example.com')
    const id = ctx.org.id
    expect((await ctx.owner.call('POST', `/auth/orgs/${id}/members/role`, { userId: ctx.ownerUser.id, role: 'member' })).body.code).toBe('last-owner')
    expect((await ctx.owner.call('POST', `/auth/orgs/${id}/members/remove`, { userId: ctx.ownerUser.id })).body.code).toBe('last-owner')
  })

  it('members can leave', async () => {
    const ctx = await team()
    const member = await join(ctx, 'm@example.com')
    expect((await member.b.call('POST', `/auth/orgs/${ctx.org.id}/members/remove`, { userId: member.user.id })).status).toBe(200)
    expect((await member.b.call('GET', '/auth/orgs')).body.orgs).toEqual([])
  })

  it('orgs.require guards your own routes', async () => {
    const ctx = await team()
    const member = await join(ctx, 'm@example.com')
    const ok = await ctx.auth.orgs.require(member.b.request('GET', '/x'), ctx.org.id)
    expect(ok).toMatchObject({ email: 'm@example.com', orgRole: 'member' })
    const denied = await ctx.auth.orgs.require(member.b.request('GET', '/x'), ctx.org.id, { role: ['owner', 'admin'] })
    expect(denied.status).toBe(403)
  })

  it('deleting the owner hands the org on', async () => {
    const ctx = await team()
    const member = await join(ctx, 'm@example.com')
    await ctx.auth.users.delete(ctx.ownerUser.id)
    expect(await ctx.auth.orgs.members(ctx.org.id)).toMatchObject([{ userId: member.user.id, role: 'owner' }])
  })

  it('is off unless turned on', async () => {
    const { browser, mailbox } = setup()
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    expect((await b.call('GET', '/auth/orgs')).status).toBe(404)
  })
})
