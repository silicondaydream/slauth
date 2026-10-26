import { beforeAll, describe, expect, it } from 'vitest'
import { createAccess, userIdFor } from './access.js'

const TEAM = 'https://suite.cloudflareaccess.com'
const AUD = 'aud-tag-123'

let keys, otherKeys, publicJwk

beforeAll(async () => {
  const params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
  keys = await crypto.subtle.generateKey(params, true, ['sign', 'verify'])
  otherKeys = await crypto.subtle.generateKey(params, true, ['sign', 'verify'])
  publicJwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' }
})

const b64 = (text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function jwt(claims, { signWith = keys.privateKey, kid = 'k1' } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))
  const body = b64(JSON.stringify({ iss: TEAM, aud: [AUD], email: 'Me@Example.com', iat: now, nbf: now, exp: now + 3600, ...claims }))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signWith, new TextEncoder().encode(`${head}.${body}`))
  return `${head}.${body}.${b64(String.fromCharCode(...new Uint8Array(sig)))}`
}

function access(extra = {}) {
  let fetches = 0
  const instance = createAccess({
    teamDomain: 'suite',
    audience: AUD,
    fetch: async (url) => {
      fetches++
      expect(url).toBe(`${TEAM}/cdn-cgi/access/certs`)
      return new Response(JSON.stringify({ keys: [publicJwk] }))
    },
    ...extra,
  })
  return { ...instance, fetches: () => fetches }
}

const request = (token, header = 'cf-access-jwt-assertion') => new Request('https://app.example/api/state', { headers: token ? { [header]: token } : {} })

describe('Access sign-in', () => {
  it('reads the person from a valid Access token', async () => {
    const user = await access().getUser(request(await jwt({})))
    expect(user).toEqual({ email: 'me@example.com', userId: await userIdFor('me@example.com') })
  })

  it('also reads the CF_Authorization cookie', async () => {
    const user = await access().getUser(request(`CF_Authorization=${await jwt({})}`, 'cookie'))
    expect(user?.email).toBe('me@example.com')
  })

  it('refuses requests that did not come through Access', async () => {
    const a = access()
    expect(await a.getUser(request(null))).toBeNull()
    expect(await a.getUser(request('not.a.jwt'))).toBeNull()
    // The plain email header alone proves nothing.
    expect(await a.getUser(new Request('https://x', { headers: { 'cf-access-authenticated-user-email': 'me@example.com' } }))).toBeNull()
  })

  it('refuses tokens signed by anyone else, for another app, another team, or expired', async () => {
    const a = access()
    expect(await a.getUser(request(await jwt({}, { signWith: otherKeys.privateKey })))).toBeNull()
    expect(await a.getUser(request(await jwt({ aud: ['other-app'] })))).toBeNull()
    expect(await a.getUser(request(await jwt({ iss: 'https://evil.cloudflareaccess.com' })))).toBeNull()
    expect(await a.getUser(request(await jwt({ exp: Math.floor(Date.now() / 1000) - 3600 })))).toBeNull()
    expect(await a.getUser(request(await jwt({}, { kid: 'unknown' })))).toBeNull()
  })

  it('refuses a token whose header claims a different algorithm', async () => {
    const token = await jwt({})
    const [, body, sig] = token.split('.')
    const none = `${b64(JSON.stringify({ alg: 'none', kid: 'k1' }))}.${body}.${sig}`
    expect(await access().getUser(request(none))).toBeNull()
  })

  it('caches the signing keys', async () => {
    const a = access()
    await a.getUser(request(await jwt({})))
    await a.getUser(request(await jwt({})))
    expect(a.fetches()).toBe(1)
  })

  it('applies the optional allow-list and aliases', async () => {
    const token = await jwt({})
    expect(await access({ allowedEmails: ['wife@example.com'] }).getUser(request(token))).toBeNull()
    const aliased = await access({ aliases: { 'me@example.com': 'owner' } }).getUser(request(token))
    expect(aliased?.userId).toBe('owner')
  })

  it('gives the same id for the same email in any app, and different ones otherwise', async () => {
    expect(await userIdFor(' ME@example.com ')).toBe(await userIdFor('me@example.com'))
    expect(await userIdFor('me@example.com')).not.toBe(await userIdFor('wife@example.com'))
    expect(await userIdFor('me@example.com')).not.toContain('example')
  })

  it('devUser stands in for Access during local development', async () => {
    const dev = createAccess({ teamDomain: 'suite', audience: '', devUser: 'me@example.com' })
    expect((await dev.getUser(request(null)))?.email).toBe('me@example.com')
  })
})
