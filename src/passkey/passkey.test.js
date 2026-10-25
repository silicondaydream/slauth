import { describe, expect, it } from 'vitest'
import { createAuthenticator } from '../../test/authenticator.js'
import { setup, signIn } from '../../test/helpers.js'
import { decodeCbor } from './cbor.js'
import { cbor } from '../../test/authenticator.js'

async function withPasskey({ alg = -7, counter = 0 } = {}) {
  const ctx = setup()
  const b = ctx.browser()
  await signIn(b, ctx.mailbox, 'me@example.com')
  const device = await createAuthenticator({ alg, counter })
  const options = (await b.call('POST', '/auth/passkey/register/options', {})).body
  const registered = await b.call('POST', '/auth/passkey/register/verify', { credential: await device.register(options), name: 'My phone' })
  return { ...ctx, b, device, options, registered }
}

async function passkeySignIn(ctx, device, overrides) {
  const fresh = ctx.browser()
  const options = (await fresh.call('POST', '/auth/passkey/login/options', {})).body
  const reply = await fresh.call('POST', '/auth/passkey/login/verify', { credential: await device.signIn(options, overrides) })
  return { ...reply, browser: fresh, options }
}

describe('passkeys', () => {
  for (const [name, alg] of [['ES256 (Apple, Google, most)', -7], ['RS256 (some Windows Hello keys)', -257]]) {
    it(`registers and signs in with ${name}`, async () => {
      const ctx = await withPasskey({ alg })
      expect(ctx.registered.status).toBe(200)
      expect(ctx.registered.body.passkey.name).toBe('My phone')
      const login = await passkeySignIn(ctx, ctx.device)
      expect(login.status).toBe(200)
      expect(login.body.user.email).toBe('me@example.com')
      expect(await login.browser.user()).toMatchObject({ email: 'me@example.com' })
    })
  }

  it('asks for a resident key and offers both algorithms', async () => {
    const { options } = await withPasskey()
    expect(options.rp).toEqual({ id: 'app.example', name: 'Test App' })
    expect(options.authenticatorSelection.residentKey).toBe('required')
    expect(options.pubKeyCredParams.map((p) => p.alg)).toEqual([-7, -257])
  })

  it('only signed-in people can add a passkey', async () => {
    const { browser } = setup()
    expect((await browser().call('POST', '/auth/passkey/register/options', {})).status).toBe(401)
  })

  it('refuses answers meant for another site', async () => {
    const ctx = await withPasskey()
    const login = await passkeySignIn(ctx, ctx.device, { origin: 'https://evil.example' })
    expect(login.status).toBe(400)
    expect(login.body.code).toBe('passkey-failed')

    const other = await createAuthenticator({ rpId: 'evil.example' })
    const options = (await ctx.b.call('POST', '/auth/passkey/register/options', {})).body
    expect((await ctx.b.call('POST', '/auth/passkey/register/verify', { credential: await other.register(options) })).status).toBe(400)
  })

  it('a challenge works once', async () => {
    const ctx = await withPasskey()
    const b = ctx.browser()
    const options = (await b.call('POST', '/auth/passkey/login/options', {})).body
    const credential = await ctx.device.signIn(options)
    expect((await b.call('POST', '/auth/passkey/login/verify', { credential })).status).toBe(200)
    expect((await b.call('POST', '/auth/passkey/login/verify', { credential })).status).toBe(400)
  })

  it('refuses a tampered signature', async () => {
    const ctx = await withPasskey()
    const b = ctx.browser()
    const options = (await b.call('POST', '/auth/passkey/login/options', {})).body
    const credential = await ctx.device.signIn(options)
    const sig = credential.response.signature
    credential.response.signature = sig.slice(0, -4) + (sig.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA')
    expect((await b.call('POST', '/auth/passkey/login/verify', { credential })).status).toBe(400)
  })

  it('spots a cloned passkey by its counter going backwards', async () => {
    const ctx = await withPasskey({ counter: 5 })
    expect((await passkeySignIn(ctx, ctx.device)).status).toBe(200)
    expect((await passkeySignIn(ctx, ctx.device, { counter: 3 })).status).toBe(400)
  })

  it('lists and removes passkeys', async () => {
    const ctx = await withPasskey()
    const list = (await ctx.b.call('GET', '/auth/passkeys')).body.passkeys
    expect(list).toHaveLength(1)
    expect((await ctx.b.call('POST', '/auth/passkey/delete', { id: list[0].id })).status).toBe(200)
    expect((await ctx.b.call('GET', '/auth/passkeys')).body.passkeys).toEqual([])
    expect((await passkeySignIn(ctx, ctx.device)).body.code).toBe('passkey-unknown')
  })

  it('can be turned off', async () => {
    const { browser } = setup({ passkeys: false })
    expect((await browser().call('POST', '/auth/passkey/login/options', {})).status).toBe(404)
  })
})

describe('CBOR', () => {
  it('reads what it is given', () => {
    const value = new Map([[1, 2], [-1, 'x'], ['k', [1, -300, new Uint8Array([7, 8])]]])
    const decoded = decodeCbor(cbor(value)).value
    expect(decoded.get(1)).toBe(2)
    expect(decoded.get(-1)).toBe('x')
    expect(decoded.get('k')[1]).toBe(-300)
    expect([...decoded.get('k')[2]]).toEqual([7, 8])
  })

  it('refuses truncated input', () => {
    expect(() => decodeCbor(Uint8Array.of(0x59, 0x01))).toThrow()
    expect(() => decodeCbor(Uint8Array.of(0x42, 0x01))).toThrow()
  })
})
