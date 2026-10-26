/**
 * Who is this? Cloudflare Access answers that before a request ever reaches the app:
 * it signs people in (email code or Google) and passes each request through with a
 * signed JWT in the Cf-Access-Jwt-Assertion header. This checks that JWT.
 *
 * Never trust the plain Cf-Access-Authenticated-User-Email header on its own: anyone who
 * reaches the Worker without going through Access (a stray route, a workers.dev URL
 * left open) can set it. The JWT can only be signed by your Access team.
 *
 * Web Crypto only, so it runs on Workers, Node 20+ and in tests alike.
 */

import { base64Url, readCookie } from './util.js'

const JWKS_TTL_MS = 60 * 60 * 1000
const CLOCK_SKEW_S = 60

/**
 * @typedef {{ email: string, userId: string }} User
 * @typedef {{
 *   teamDomain: string,
 *   audience: string | string[],
 *   allowedEmails?: string[],
 *   aliases?: Record<string, string>,
 *   devUser?: string,
 *   fetch?: typeof fetch,
 * }} AccessOptions
 */

/**
 * @param {AccessOptions} options
 *   teamDomain     "yourteam" or "yourteam.cloudflareaccess.com"
 *   audience       the Application Audience (AUD) tag from the Access application
 *   allowedEmails  optional second check after the Access policy
 *   aliases        email -> userId, to keep someone's data when their email changes
 *   devUser        local development only: treat every request as this email
 */
export function createAccess(options) {
  const team = normalizeTeam(options.teamDomain)
  const issuer = `https://${team}`
  const audiences = [options.audience].flat().filter(Boolean)
  const allowed = options.allowedEmails?.map((e) => e.trim().toLowerCase())
  const doFetch = options.fetch ?? ((...args) => fetch(...args))

  if (!options.devUser && audiences.length === 0) throw new Error('slauth: Access audience (AUD tag) is required.')

  /** @type {{ keys: Map<string, CryptoKey>, at: number } | null} */
  let jwks = null

  async function keyFor(kid, force = false) {
    if (force || !jwks || Date.now() - jwks.at > JWKS_TTL_MS) {
      const res = await doFetch(`${issuer}/cdn-cgi/access/certs`)
      if (!res.ok) throw new Error(`slauth: could not load Access keys (${res.status}).`)
      const { keys = [] } = await res.json()
      const map = new Map()
      for (const jwk of keys) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue
        map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']))
      }
      jwks = { keys: map, at: Date.now() }
    }
    return jwks.keys.get(kid)
  }

  /**
   * The signed-in person, or null when the request didn't come through Access, the
   * token is bad or expired, or the email isn't on the list.
   * @param {Request} request
   * @returns {Promise<User | null>}
   */
  async function getUser(request) {
    if (options.devUser) return toUser(options.devUser)

    const token = request.headers.get('cf-access-jwt-assertion') ?? readCookie(request.headers.get('cookie'), 'CF_Authorization')
    if (!token) return null
    const claims = await verify(token)
    if (!claims || typeof claims.email !== 'string') return null
    return toUser(claims.email)
  }

  async function verify(token) {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    let header, claims
    try {
      header = JSON.parse(decodeText(parts[0]))
      claims = JSON.parse(decodeText(parts[1]))
    } catch {
      return null
    }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null

    // Access rotates its keys; an unknown kid means it's time to look again.
    const key = (await keyFor(header.kid)) ?? (await keyFor(header.kid, true))
    if (!key) return null

    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBytes(parts[2]), signed)
    if (!ok) return null

    const now = Math.floor(Date.now() / 1000)
    if (claims.iss !== issuer) return null
    if (![claims.aud].flat().some((a) => audiences.includes(a))) return null
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) return null
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) return null
    return claims
  }

  async function toUser(rawEmail) {
    const email = rawEmail.trim().toLowerCase()
    if (allowed && !allowed.includes(email)) return null
    return { email, userId: options.aliases?.[email] ?? (await userIdFor(email)) }
  }

  return { getUser }
}

/**
 * A stable, opaque id for an email: the same in every app, so the suite agrees on who
 * is who without sharing a database. It never contains the email itself.
 * @param {string} email
 */
export async function userIdFor(email) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`slauth:${email.trim().toLowerCase()}`))
  return `u_${base64Url(bytes).slice(0, 22)}`
}

function normalizeTeam(domain) {
  const bare = String(domain ?? '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return bare.includes('.') ? bare : `${bare}.cloudflareaccess.com`
}


function decodeBytes(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function decodeText(segment) {
  return new TextDecoder().decode(decodeBytes(segment))
}

