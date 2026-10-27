import { base64Url, sha256, safeEqual } from './util.js'

const STEP = 30
const RECOVERY_CODES = 10

/**
 * Two-factor sign-in with an authenticator app (TOTP, RFC 6238: 6 digits, 30 seconds,
 * SHA-1, which is what every app supports), plus one-time recovery codes.
 *
 *   totp:<userId>   { secret, enabledAt, lastStep, recovery: [sha256 of each code] }
 *
 * A code is accepted for the 30 seconds before and after its own, and only once.
 *
 * @param {{ store: import('./index.js').Store, issuer: string }} options
 */
export function createTwoFactor({ store, issuer }) {
  const key = (userId) => `totp:${userId}`

  return {
    async enabled(userId) {
      return Boolean((await store.get(key(userId)))?.enabledAt)
    },

    /** Starts setting up: a new secret and the otpauth:// link to show as a QR code. */
    async setup(user) {
      const secret = base32(crypto.getRandomValues(new Uint8Array(20)))
      await store.put(key(user.id), { secret, enabledAt: null, lastStep: 0, recovery: [] })
      const label = encodeURIComponent(`${issuer}:${user.email}`)
      return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}` }
    },

    /** Finishes setting up once the app shows a right code. Returns the recovery codes, or null. */
    async enable(userId, code) {
      const doc = await store.get(key(userId))
      if (!doc || doc.enabledAt) return null
      const step = await matchStep(doc.secret, code, doc.lastStep)
      if (step === null) return null
      const recovery = newRecoveryCodes()
      await store.put(key(userId), { ...doc, enabledAt: Date.now(), lastStep: step, recovery: await Promise.all(recovery.map(hashCode)) })
      return recovery
    },

    /** Checks an app code or a recovery code (each recovery code works once). */
    async check(userId, { code, recoveryCode } = {}) {
      const doc = await store.get(key(userId))
      if (!doc?.enabledAt) return false
      if (recoveryCode) {
        const hash = await hashCode(recoveryCode)
        if (!doc.recovery.some((h) => safeEqual(h, hash))) return false
        await store.put(key(userId), { ...doc, recovery: doc.recovery.filter((h) => h !== hash) })
        return true
      }
      const step = await matchStep(doc.secret, code, doc.lastStep)
      if (step === null) return false
      await store.put(key(userId), { ...doc, lastStep: step })
      return true
    },

    async recoveryLeft(userId) {
      return (await store.get(key(userId)))?.recovery.length ?? 0
    },

    async regenerate(userId) {
      const doc = await store.get(key(userId))
      const recovery = newRecoveryCodes()
      await store.put(key(userId), { ...doc, recovery: await Promise.all(recovery.map(hashCode)) })
      return recovery
    },

    async disable(userId) {
      await store.delete(key(userId))
    },
  }
}

/** The time step a 6-digit code belongs to (now ± 1), or null. Steps at or before `after` are spent. */
async function matchStep(secret, code, after = 0) {
  const guess = String(code ?? '').replace(/\D/g, '')
  if (guess.length !== 6) return null
  const now = Math.floor(Date.now() / 1000 / STEP)
  for (const step of [now - 1, now, now + 1]) {
    if (step > after && safeEqual(await totp(secret, step), guess)) return step
  }
  return null
}

/** The code for a base32 secret at a time step (exported for tests and your own tools). */
export async function totp(secret, step = Math.floor(Date.now() / 1000 / STEP)) {
  const counter = new Uint8Array(8)
  new DataView(counter.buffer).setBigUint64(0, BigInt(step))
  const key = await crypto.subtle.importKey('raw', fromBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter))
  const at = mac[19] & 0xf
  const value = ((mac[at] & 0x7f) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3]
  return String(value % 1_000_000).padStart(6, '0')
}

function newRecoveryCodes() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: RECOVERY_CODES }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(10))
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
    return `${chars.slice(0, 5)}-${chars.slice(5)}`
  })
}

async function hashCode(code) {
  return base64Url(await sha256(String(code).trim().toLowerCase().replace(/[^a-z0-9]/g, '')))
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32(bytes) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(text) {
  let bits = 0
  let value = 0
  const out = []
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | BASE32.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}
