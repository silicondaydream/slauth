import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLock } from './lock.js'

function memoryStore() {
  const docs = new Map()
  return {
    get: async (id) => docs.get(id) ?? null,
    put: async (id, doc) => void docs.set(id, structuredClone(doc)),
    peek: (id) => docs.get(id),
  }
}

const me = { email: 'me@example.com', userId: 'u_me' }
const wife = { email: 'wife@example.com', userId: 'u_wife' }

/** The "name=value" part of a Set-Cookie header, as the browser would send it back. */
const sent = (reply) => reply.cookie.split(';')[0]
const body = (value) => async () => value
const call = (lock, route, user, value, cookie = '') => lock.handle(route, route === 'session' ? 'GET' : 'POST', body(value), user, cookie, false)

afterEach(() => vi.useRealTimers())

describe('app lock', () => {
  it('asks each person to create a PIN on first visit, then unlocks with it', async () => {
    const store = memoryStore()
    const lock = createLock(store)
    expect((await call(lock, 'session', me)).body).toEqual({ email: me.email, policy: 'weekly', required: true, pinSet: false, unlocked: false })

    const setup = await call(lock, 'setup', me, { pin: '2580' })
    expect(setup.status).toBe(200)
    expect(await lock.isUnlocked(me, sent(setup))).toBe(true)
    expect(JSON.stringify(store.peek(me.userId))).not.toContain('2580')

    // Only once.
    expect((await call(lock, 'setup', me, { pin: '1111' })).status).toBe(409)
  })

  it('keeps people apart: one person’s PIN and cookie mean nothing for another', async () => {
    const lock = createLock(memoryStore())
    const mine = await call(lock, 'setup', me, { pin: '2580' })
    await call(lock, 'setup', wife, { pin: '1234' })

    expect(await lock.isUnlocked(wife, sent(mine))).toBe(false)
    expect((await call(lock, 'login', wife, { pin: '2580' })).status).toBe(401)
    expect((await call(lock, 'login', wife, { pin: '1234' })).status).toBe(200)
  })

  it('counts wrong tries per person and locks after five', async () => {
    const lock = createLock(memoryStore())
    await call(lock, 'setup', me, { pin: '2580' })
    await call(lock, 'setup', wife, { pin: '1234' })
    const tries = []
    for (let i = 0; i < 5; i++) tries.push(await call(lock, 'login', me, { pin: '0000' }))
    expect(tries.slice(0, 4).map((t) => t.body.attemptsLeft)).toEqual([4, 3, 2, 1])
    expect(tries[4].status).toBe(429)
    // Even the right PIN waits out the lock, but only for the person who missed.
    expect((await call(lock, 'login', me, { pin: '2580' })).status).toBe(429)
    expect((await call(lock, 'login', wife, { pin: '1234' })).status).toBe(200)
  })

  it('asks again once the chosen interval has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
    const lock = createLock(memoryStore())
    const unlocked = await call(lock, 'setup', me, { pin: '2580', policy: 'daily' })

    vi.setSystemTime(new Date('2026-10-01T20:00:00Z'))
    expect(await lock.isUnlocked(me, sent(unlocked))).toBe(true)
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'))
    expect(await lock.isUnlocked(me, sent(unlocked))).toBe(false)
  })

  it('a stricter setting applies to unlocks already given out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'))
    const lock = createLock(memoryStore())
    const unlocked = await call(lock, 'setup', me, { pin: '2580' })
    await call(lock, 'policy', me, { policy: 'daily', pin: '2580' }, sent(unlocked))

    vi.setSystemTime(new Date('2026-10-03T09:00:00Z'))
    expect(await lock.isUnlocked(me, sent(unlocked))).toBe(false)
  })

  it('"always" unlocks only for this browser session', async () => {
    const lock = createLock(memoryStore())
    const setup = await call(lock, 'setup', me, { pin: '2580', policy: 'always' })
    expect(setup.cookie).not.toContain('Max-Age')
    expect(await lock.isUnlocked(me, sent(setup))).toBe(true)
  })

  it('"never" skips the PIN, and turning it off needs the current PIN', async () => {
    const lock = createLock(memoryStore())
    const unlocked = await call(lock, 'setup', me, { pin: '2580' })

    expect((await call(lock, 'policy', me, { policy: 'never' }, sent(unlocked))).status).toBe(403)
    expect((await call(lock, 'policy', me, { policy: 'never', pin: '2580' }, sent(unlocked))).status).toBe(200)
    expect(await lock.isUnlocked(me, '')).toBe(true)
    expect((await call(lock, 'session', me)).body).toMatchObject({ required: false, pinSet: true })
  })

  it('someone can choose no PIN at all on their first visit', async () => {
    const lock = createLock(memoryStore())
    expect((await call(lock, 'setup', wife, { policy: 'never' })).status).toBe(200)
    expect(await lock.isUnlocked(wife, '')).toBe(true)
    // Asking for a PIN later means creating one.
    expect((await call(lock, 'policy', wife, { policy: 'weekly' })).status).toBe(409)
    expect((await call(lock, 'setup', wife, { pin: '1234', policy: 'weekly' })).status).toBe(200)
    expect(await lock.isUnlocked(wife, '')).toBe(false)
  })

  it('changing the PIN locks this person’s other devices', async () => {
    const lock = createLock(memoryStore())
    const phone = await call(lock, 'setup', me, { pin: '2580' })
    const ipad = await call(lock, 'login', me, { pin: '2580' })

    expect((await call(lock, 'pin', me, { current: '9999', next: '1234' }, sent(ipad))).status).toBe(403)
    const changed = await call(lock, 'pin', me, { current: '2580', next: '1234' }, sent(ipad))
    expect(changed.status).toBe(200)
    expect(await lock.isUnlocked(me, sent(changed))).toBe(true)
    expect(await lock.isUnlocked(me, sent(phone))).toBe(false)
  })

  it('refuses Settings changes while locked', async () => {
    const lock = createLock(memoryStore())
    await call(lock, 'setup', me, { pin: '2580' })
    expect((await call(lock, 'pin', me, { current: '2580', next: '1234' })).status).toBe(401)
    expect((await call(lock, 'policy', me, { policy: 'never', pin: '2580' })).status).toBe(401)
  })

  it('accepts a PIN saved by the old single-user apps, so nobody has to choose a new one', async () => {
    // The shape Planda and LedgerFox keep under their "auth" key.
    const salt = 'old-salt'
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode('2580'), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100_000 }, key, 256)
    const pinHash = btoa(String.fromCharCode(...new Uint8Array(bits))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const store = memoryStore()
    await store.put(me.userId, { pinHash, salt, sessionKey: 'k', failures: 0, lockedUntil: 0 })

    const lock = createLock(store)
    expect((await call(lock, 'session', me)).body).toMatchObject({ pinSet: true, policy: 'weekly' })
    expect((await call(lock, 'login', me, { pin: '2580' })).status).toBe(200)
  })

  it('uses the cookie name it is given', async () => {
    const lock = createLock(memoryStore(), { cookie: 'planda_session' })
    const setup = await call(lock, 'setup', me, { pin: '2580' })
    expect(setup.cookie.startsWith('planda_session=')).toBe(true)
    expect(await lock.isUnlocked(me, `other=1; ${sent(setup)}`)).toBe(true)
  })
})
