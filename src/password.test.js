import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'
import { setup, signIn } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

const fast = { passwords: { iterations: 1000 } }

describe('passwords', () => {
  it('hashes with PBKDF2 and a salt each time', async () => {
    const a = await hashPassword('correct horse', 1000)
    const b = await hashPassword('correct horse', 1000)
    expect(a).toMatch(/^pbkdf2-sha256\$1000\$/)
    expect(a).not.toBe(b)
    expect(await verifyPassword('correct horse', a)).toBe(true)
    expect(await verifyPassword('correct horsf', a)).toBe(false)
  })

  it('sign up proves the email first, then the password works', async () => {
    const { browser, mailbox } = setup(fast)
    const b = browser()
    const started = await b.call('POST', '/auth/password/signup', { email: 'me@example.com', password: 'long enough' })
    expect(started.body).toEqual({ ok: true, verify: 'email' })
    // Not until the code is used.
    expect((await browser().call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'long enough' })).status).toBe(400)
    await b.call('POST', '/auth/email/verify', { email: 'me@example.com', code: mailbox[0].code })
    const later = browser()
    const reply = await later.call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'long enough' })
    expect(reply.status).toBe(200)
    expect(reply.body.user.email).toBe('me@example.com')
    expect((await later.user()).email).toBe('me@example.com')
  })

  it('refuses short passwords, and checks yours', async () => {
    const { browser } = setup({ passwords: { iterations: 1000, validate: (p) => (p.includes('password') ? 'Not that one.' : null) } })
    expect((await browser().call('POST', '/auth/password/signup', { email: 'me@example.com', password: 'short' })).body.code).toBe('weak-password')
    expect((await browser().call('POST', '/auth/password/signup', { email: 'me@example.com', password: 'my password' })).body.error).toBe('Not that one.')
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { browser } = setup(fast)
    const unknown = await browser().call('POST', '/auth/password/signin', { email: 'nobody@example.com', password: 'whatever123' })
    expect(unknown.body).toEqual({ error: "That email and password don't match.", code: 'bad-password' })
  })

  it('locks the email after 10 wrong passwords', async () => {
    const { browser, mailbox } = setup(fast)
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    await b.call('POST', '/auth/password/set', { password: 'the right one' })
    for (let i = 0; i < 10; i++) await browser().call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'wrong wrong' })
    const locked = await browser().call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'the right one' })
    expect(locked.body.code).toBe('too-many-tries')
  })

  it('changing needs the current password or a recent sign-in, and signs out other sessions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { browser, mailbox } = setup(fast)
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    expect((await b.call('POST', '/auth/password/set', { password: 'first one!' })).status).toBe(200)
    const other = browser()
    await other.call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'first one!' })
    expect(await other.user()).not.toBeNull()

    vi.setSystemTime(Date.now() + 60 * 60_000)
    expect((await b.call('POST', '/auth/password/set', { password: 'second one' })).body.code).toBe('reauth-required')
    expect((await b.call('POST', '/auth/password/set', { password: 'second one', current: 'nope nope' })).body.code).toBe('bad-password')
    expect((await b.call('POST', '/auth/password/set', { password: 'second one', current: 'first one!' })).status).toBe(200)
    expect(await other.user()).toBeNull()
    expect(await b.user()).not.toBeNull()
  })

  it('is off unless turned on', async () => {
    const { browser } = setup()
    expect((await browser().call('POST', '/auth/password/signin', { email: 'me@example.com', password: 'x' })).status).toBe(404)
  })
})
