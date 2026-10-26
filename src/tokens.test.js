import { afterEach, describe, expect, it, vi } from 'vitest'
import { slauth } from './core.js'
import { memory } from './stores/memory.js'
import { setup, signIn } from '../test/helpers.js'

afterEach(() => vi.useRealTimers())

describe('tokens for your APIs', () => {
  it('hands out short-lived ES256 JWTs that the JWKS can check', async () => {
    const { auth, browser, mailbox } = setup({ tokens: { issuer: 'https://app.example', claims: (u) => ({ plan: 'pro' }) } })
    const b = browser()
    await signIn(b, mailbox, 'me@example.com')
    const { token, expiresAt } = (await b.call('GET', '/auth/token')).body
    expect(expiresAt - Date.now()).toBeGreaterThan(4 * 60_000)

    // Checked the way another service would: with only the public key.
    const [head, body, signature] = token.split('.')
    const header = JSON.parse(atob(head.replace(/-/g, '+').replace(/_/g, '/')))
    const { keys } = (await b.call('GET', '/auth/jwks.json')).body
    const jwk = keys.find((k) => k.kid === header.kid)
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256' })
    expect(jwk.d).toBeUndefined()
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (signature.length % 4)) % 4)), (c) => c.charCodeAt(0))
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(`${head}.${body}`))).toBe(true)

    expect(await auth.verifyToken(token)).toMatchObject({ email: 'me@example.com', plan: 'pro', iss: 'https://app.example' })
    // And auth.user takes it as a bearer token.
    expect((await auth.user(new Request('https://app.example/api', { headers: { authorization: `Bearer ${token}` } }))).email).toBe('me@example.com')
  })

  it('refuses tampered and expired tokens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { auth } = setup({ tokens: true })
    const user = await auth.users.create({ email: 'me@example.com' })
    const { token } = await auth.createToken(user)
    const [head, , sig] = token.split('.')
    const forged = btoa(JSON.stringify({ sub: user.id, email: 'me@example.com', roles: ['admin'], exp: 9e9 })).replace(/=+$/, '')
    expect(await auth.verifyToken(`${head}.${forged}.${sig}`)).toBeNull()
    vi.setSystemTime(Date.now() + 6 * 60_000)
    expect(await auth.verifyToken(token)).toBeNull()
  })

  it('keeps one signing key in the store, readable only with the secret', async () => {
    const store = memory()
    const a = slauth({ secret: 'one-secret-one-secret', store, tokens: true, email: { send: async () => {} } })
    const user = await a.users.create({ email: 'me@example.com' })
    const { token } = await a.createToken(user)
    const kid = await store.get('jwk:current')
    expect(JSON.stringify(await store.get(`jwk:${kid}`))).not.toContain('"d":')
    // Another server with the same secret signs with the same key.
    const b = slauth({ secret: 'one-secret-one-secret', store, tokens: true, email: { send: async () => {} } })
    expect(JSON.parse(atob((await b.createToken(user)).token.split('.')[0])).kid).toBe(kid)
    expect(await b.verifyToken(token)).not.toBeNull()
  })
})
