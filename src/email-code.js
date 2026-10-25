import { codeMessage } from './email/message.js'
import { hmac, safeEqual } from './util.js'

const CODE_MINUTES = 10
const MAX_TRIES = 5
const RESEND_SECONDS = 60

/**
 * Sign in with a 6-digit code sent by email.
 *
 *   code:<email>  { hash, expiresAt, tries, sentAt }  (lives 10 minutes)
 *
 * Only an HMAC of the code is stored. Each code allows 5 tries, and a new code can be
 * asked for once a minute per address.
 *
 * @param {{ store: import('./index.js').Store, secret: string, sender: import('./index.js').EmailSender, appName: string }} options
 */
export function createEmailCodes({ store, secret, sender, appName }) {
  const hashOf = (email, code) => hmac(secret, `code:${email}:${code}`)

  return {
    /** @returns {Promise<{ ok: true } | { ok: false, code: 'slow-down', retryAfter: number }>} */
    async start(email) {
      const existing = await store.get(`code:${email}`)
      const wait = existing ? Math.ceil((existing.sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0
      if (wait > 0) return { ok: false, code: 'slow-down', retryAfter: wait }

      const code = randomCode()
      const now = Date.now()
      await store.put(`code:${email}`, { hash: await hashOf(email, code), expiresAt: now + CODE_MINUTES * 60_000, tries: 0, sentAt: now }, { ttl: CODE_MINUTES * 60 })
      await sender.send({ to: email, code, appName, ...codeMessage({ code, appName, minutes: CODE_MINUTES }) })
      return { ok: true }
    },

    /** @returns {Promise<{ ok: true } | { ok: false, code: 'expired' | 'too-many-tries' | 'bad-code', triesLeft?: number }>} */
    async verify(email, code) {
      const entry = await store.get(`code:${email}`)
      if (!entry || entry.expiresAt <= Date.now()) return { ok: false, code: 'expired' }
      if (entry.tries >= MAX_TRIES) return { ok: false, code: 'too-many-tries' }

      const guess = String(code ?? '').replace(/\D/g, '')
      if (guess.length === 6 && safeEqual(await hashOf(email, guess), entry.hash)) {
        await store.delete(`code:${email}`)
        return { ok: true }
      }
      const tries = entry.tries + 1
      const ttl = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
      await store.put(`code:${email}`, { ...entry, tries }, { ttl })
      return tries >= MAX_TRIES ? { ok: false, code: 'too-many-tries' } : { ok: false, code: 'bad-code', triesLeft: MAX_TRIES - tries }
    },
  }
}

/** Six uniformly random digits (rejection sampling, so no digit is likelier than another). */
function randomCode() {
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < 4_294_000_000) return String(buf[0] % 1_000_000).padStart(6, '0')
  }
}
