import { defaultMessage } from './email/message.js'
import { hmac, safeEqual } from './util.js'

export const CODE_MINUTES = 10
const MAX_TRIES = 5
const RESEND_SECONDS = 60

/**
 * 6-digit codes sent by email: for signing in, and for confirming a new address.
 *
 *   code:<email>              { hash, expiresAt, tries, sentAt, ... }  (lives 10 minutes)
 *   code-change:<userId>      the same, for a new email address
 *
 * Only an HMAC of the code is stored. Each code allows 5 tries, and a new code can be
 * asked for once a minute per address.
 *
 * @param {{ store: import('./index.js').Store, secret: string, sender: import('./index.js').EmailSender, appName: string, message?: import('./index.js').SlauthConfig['emails'] }} options
 */
export function createEmailCodes({ store, secret, sender, appName, message }) {
  const hashOf = (email, code) => hmac(secret, `code:${email}:${code}`)

  return {
    /**
     * @param {string} email
     * @param {{ key?: string, kind?: 'sign-in' | 'email-change', link?: string, data?: object }} [options]
     * @returns {Promise<{ ok: true } | { ok: false, code: 'slow-down', retryAfter: number }>}
     */
    async start(email, { key = `code:${email}`, kind = 'sign-in', link, data = {} } = {}) {
      const existing = await store.get(key)
      const wait = existing ? Math.ceil((existing.sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0
      if (wait > 0) return { ok: false, code: 'slow-down', retryAfter: wait }

      const code = randomCode()
      const now = Date.now()
      await store.put(key, { ...data, email, hash: await hashOf(email, code), expiresAt: now + CODE_MINUTES * 60_000, tries: 0, sentAt: now }, { ttl: CODE_MINUTES * 60 })
      await send({ kind, to: email, code, link, minutes: CODE_MINUTES })
      return { ok: true }
    },

    /** @returns {Promise<{ ok: true, entry: object } | { ok: false, code: 'expired' | 'too-many-tries' | 'bad-code', triesLeft?: number }>} */
    async verify(email, code, { key = `code:${email}` } = {}) {
      const entry = await store.get(key)
      if (!entry || entry.expiresAt <= Date.now() || (entry.email && entry.email !== email)) return { ok: false, code: 'expired' }
      if (entry.tries >= MAX_TRIES) return { ok: false, code: 'too-many-tries' }

      const guess = String(code ?? '').replace(/\D/g, '')
      if (guess.length === 6 && safeEqual(await hashOf(email, guess), entry.hash)) {
        await store.delete(key)
        return { ok: true, entry }
      }
      const tries = entry.tries + 1
      const ttl = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
      await store.put(key, { ...entry, tries }, { ttl })
      return tries >= MAX_TRIES ? { ok: false, code: 'too-many-tries' } : { ok: false, code: 'bad-code', triesLeft: MAX_TRIES - tries }
    },

    send,
  }

  /** Builds an email (yours, if you passed `emails`) and hands it to the sender. */
  async function send({ kind, to, code, link, ...details }) {
    const data = { code, link, appName, ...details }
    const built = (message && (await message(kind, data))) || defaultMessage(kind, data)
    // New-sign-in emails also tell your sender which device it was.
    const about = kind === 'new-sign-in' ? { device: details.device, method: details.method, when: details.when } : {}
    await sender.send({ to, code, link, appName, kind, ...about, ...built })
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
