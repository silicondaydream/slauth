import { base64Url, fromBase64Url, randomId } from './util.js'

const enc = new TextEncoder()
const ES256 = { name: 'ECDSA', namedCurve: 'P-256' }

/**
 * Short-lived JWTs (ES256) for calling your other services, which can check them with
 * the public keys at /auth/jwks.json and no shared secret, like Clerk's getToken().
 *
 *   jwk:current  -> kid
 *   jwk:<kid>    { kid, publicJwk, privateJwk (AES-GCM encrypted with a key from `secret`), createdAt }
 *
 * The signing key is made on first use. Changing `secret` makes a new one; tokens only
 * live a few minutes, so nothing much notices.
 *
 * @param {{ store: import('./index.js').Store, secret: string, minutes?: number, issuer?: string, audience?: string, claims?: (user: object) => object | Promise<object> }} options
 */
export function createTokens({ store, secret, minutes = 5, issuer, audience, claims }) {
  let wrapKey = null
  const wrapping = () =>
    (wrapKey ??= crypto.subtle
      .importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((base) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('slauth-jwk'), info: enc.encode('wrap') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])))

  let signing = null

  async function currentKey() {
    // Re-check now and then, so every server ends up signing with the same key.
    if (signing && Date.now() - signing.checkedAt < 60_000) return signing
    const kid = await store.get('jwk:current')
    if (signing && signing.kid === kid) return Object.assign(signing, { checkedAt: Date.now() })
    const doc = kid ? await store.get(`jwk:${kid}`) : null
    if (doc) {
      try {
        const iv = fromBase64Url(doc.privateJwk.iv)
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await wrapping(), fromBase64Url(doc.privateJwk.data))
        const key = await crypto.subtle.importKey('jwk', JSON.parse(new TextDecoder().decode(plain)), ES256, false, ['sign'])
        return (signing = { kid, key, checkedAt: Date.now() })
      } catch {
        // Made with another secret: start over below.
      }
    }
    const pair = await crypto.subtle.generateKey(ES256, true, ['sign', 'verify'])
    const newKid = randomId('key', 9)
    const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: newKid, alg: 'ES256', use: 'sig' }
    delete publicJwk.key_ops
    delete publicJwk.ext
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapping(), enc.encode(JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey))))
    await store.put(`jwk:${newKid}`, { kid: newKid, publicJwk, privateJwk: { iv: base64Url(iv), data: base64Url(data) }, createdAt: Date.now() })
    const previous = kid ? [kid, ...((await store.get('jwk:previous')) ?? [])].slice(0, 2) : []
    await store.put('jwk:previous', previous)
    await store.put('jwk:current', newKid)
    return (signing = { kid: newKid, key: pair.privateKey, checkedAt: Date.now() })
  }

  async function publicKey(kid) {
    const doc = typeof kid === 'string' ? await store.get(`jwk:${kid}`) : null
    return doc ? crypto.subtle.importKey('jwk', doc.publicJwk, ES256, false, ['verify']) : null
  }

  return {
    /** A signed token for this user: { token, expiresAt }. */
    async create(user, extra = {}) {
      const { kid, key } = await currentKey()
      const now = Math.floor(Date.now() / 1000)
      const payload = {
        ...(claims ? await claims(user) : {}),
        ...extra,
        sub: user.id,
        email: user.email,
        name: user.name ?? null,
        roles: user.roles ?? [],
        iat: now,
        exp: now + minutes * 60,
        ...(issuer ? { iss: issuer } : {}),
        ...(audience ? { aud: audience } : {}),
      }
      const head = base64Url(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })))
      const body = base64Url(enc.encode(JSON.stringify(payload)))
      const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`))
      return { token: `${head}.${body}.${base64Url(signature)}`, expiresAt: payload.exp * 1000 }
    },

    /** The claims of a token we signed that hasn't expired, or null. */
    async verify(token) {
      try {
        const [head, body, signature] = String(token).split('.')
        if (!signature) return null
        const header = JSON.parse(new TextDecoder().decode(fromBase64Url(head)))
        if (header.alg !== 'ES256') return null
        const key = await publicKey(header.kid)
        if (!key) return null
        const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64Url(signature), enc.encode(`${head}.${body}`))
        if (!ok) return null
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)))
        const now = Math.floor(Date.now() / 1000)
        if (typeof payload.exp !== 'number' || payload.exp < now - 30) return null
        if (issuer && payload.iss !== issuer) return null
        if (audience && payload.aud !== audience) return null
        return payload
      } catch {
        return null
      }
    },

    /** The public keys, as served at /auth/jwks.json. */
    async jwks() {
      await currentKey()
      const kids = [await store.get('jwk:current'), ...((await store.get('jwk:previous')) ?? [])]
      const keys = []
      for (const kid of kids) {
        const doc = kid ? await store.get(`jwk:${kid}`) : null
        if (doc) keys.push(doc.publicJwk)
      }
      return { keys }
    },
  }
}
