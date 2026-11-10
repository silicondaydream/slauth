import { device } from './device.js'

/**
 * "New sign-in" emails, when `newSignInEmails` is on: an email when someone's account
 * signs in from a browser and OS family it hasn't used before.
 *
 *   devices:<userId>  ['Chrome on macOS', 'Safari on iOS', ...]  (the last 20 families seen)
 *
 * Nothing finer than the family is kept (no versions, no fingerprinting). A brand-new
 * account gets no email. The first time someone signs in with this turned on, their other
 * live sessions are the starting point; with none, that sign-in starts the list quietly.
 *
 * @param {{ store: import('./index.js').Store, codes: { send(message: object): Promise<void> }, sessions: { list(userId: string): Promise<{ id: string, userAgent: string | null }[]> }, accountPage?: string }} options
 */
export function createNewSignIns({ store, codes, sessions, accountPage }) {
  /**
   * @param {{ id: string, email: string }} user
   * @param {Request} request
   * @param {{ method: string, sessionId: string, isNew?: boolean, origin: string }} details
   */
  return async function signedIn(user, request, { method, sessionId, isNew = false, origin }) {
    try {
      const family = device(request.headers.get('user-agent'))
      const key = `devices:${user.id}`
      let seen = await store.get(key)
      let known = true
      if (!Array.isArray(seen)) {
        const others = (await sessions.list(user.id)).filter((s) => s.id !== sessionId)
        seen = [...new Set(others.map((s) => device(s.userAgent)))]
        known = seen.length > 0
      }
      if (seen.includes(family)) return
      await store.put(key, [...seen, family].slice(-20))
      if (isNew || !known) return
      await codes.send({
        kind: 'new-sign-in',
        to: user.email,
        device: family,
        method,
        when: new Date().toUTCString(),
        link: accountPage ? new URL(accountPage, origin).toString() : undefined,
      })
    } catch (error) {
      // A sign-in never fails because the email didn't go out.
      console.error('slauth: the new sign-in email failed:', error?.message ?? error)
    }
  }
}
