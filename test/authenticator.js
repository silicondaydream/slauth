/**
 * A pretend passkey authenticator for tests: makes real keys, real authenticatorData,
 * real CBOR and real signatures, exactly as a phone or laptop would.
 */

const enc = new TextEncoder()
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)), (c) => c.charCodeAt(0))
const sha256 = async (data) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) out.set(p, at), (at += p.length)
  return out
}

/** Minimal CBOR encoder: ints, byte strings, text, arrays, maps. */
export function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Uint8Array.of((major << 5) | n)
    if (n < 256) return Uint8Array.of((major << 5) | 24, n)
    if (n < 65536) return Uint8Array.of((major << 5) | 25, n >> 8, n & 255)
    return Uint8Array.of((major << 5) | 26, n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (value instanceof Uint8Array) return cat(head(2, value.length), value)
  if (typeof value === 'string') {
    const b = enc.encode(value)
    return cat(head(3, b.length), b)
  }
  if (Array.isArray(value)) return cat(head(4, value.length), ...value.map(cbor))
  if (value instanceof Map) return cat(head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]))
  if (typeof value === 'object') return cbor(new Map(Object.entries(value)))
  throw new Error('cbor: unsupported')
}

function rawToDer(raw) {
  const int = (bytes) => {
    let i = 0
    while (i < bytes.length - 1 && bytes[i] === 0) i++
    let v = bytes.slice(i)
    if (v[0] & 0x80) v = cat(Uint8Array.of(0), v)
    return cat(Uint8Array.of(2, v.length), v)
  }
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)))
  return cat(Uint8Array.of(0x30, body.length), body)
}

export async function createAuthenticator({ alg = -7, rpId = 'app.example', origin = 'https://app.example', counter = 0 } = {}) {
  const keys =
    alg === -7
      ? await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
      : await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const coseKey =
    alg === -7
      ? new Map([[1, 2], [3, -7], [-1, 1], [-2, unb64u(jwk.x)], [-3, unb64u(jwk.y)]])
      : new Map([[1, 3], [3, -257], [-1, unb64u(jwk.n)], [-2, unb64u(jwk.e)]])
  const credentialId = crypto.getRandomValues(new Uint8Array(16))
  let userHandle = null
  let count = counter

  const clientData = (type, challenge, o = origin) => enc.encode(JSON.stringify({ type, challenge, origin: o, crossOrigin: false }))
  const authData = async (flags, extra = new Uint8Array()) => {
    const c = new Uint8Array(4)
    new DataView(c.buffer).setUint32(0, count)
    return cat(await sha256(enc.encode(rpId)), Uint8Array.of(flags), c, extra)
  }

  return {
    id: b64u(credentialId),
    /** What navigator.credentials.create() + toJSON() would give the server. */
    async register(options, overrides = {}) {
      userHandle = options.user.id
      const idLen = Uint8Array.of(credentialId.length >> 8, credentialId.length & 255)
      const ad = await authData(0x45, cat(new Uint8Array(16), idLen, credentialId, cbor(coseKey)))
      const cd = clientData('webauthn.create', options.challenge, overrides.origin)
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: { clientDataJSON: b64u(cd), attestationObject: b64u(cbor({ fmt: 'none', attStmt: new Map(), authData: ad })), transports: ['internal'] },
      }
    },
    /** What navigator.credentials.get() + toJSON() would give the server. */
    async signIn(options, overrides = {}) {
      count = overrides.counter ?? (count === 0 && counter === 0 ? 0 : count + 1)
      const ad = await authData(0x05)
      const cd = clientData('webauthn.get', options.challenge, overrides.origin)
      const signed = cat(ad, await sha256(cd))
      const sig =
        alg === -7
          ? rawToDer(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed)))
          : new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, keys.privateKey, signed))
      return {
        id: b64u(credentialId),
        rawId: b64u(credentialId),
        type: 'public-key',
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(sig), userHandle },
      }
    },
  }
}
