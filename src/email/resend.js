/**
 * Sends codes with Resend (resend.com; the free tier is plenty for a side project).
 *
 * @param {{ apiKey: string, from: string, fetch?: typeof fetch }} options
 *   from  a sender on a domain you verified in Resend, e.g. "My App <hi@myapp.dev>"
 * @returns {import('../index.js').EmailSender}
 */
export function resend({ apiKey, from, fetch: doFetch = (...args) => fetch(...args) }) {
  if (!apiKey) throw new Error('slauth: resend() needs an apiKey.')
  if (!from) throw new Error('slauth: resend() needs a from address on a domain you verified in Resend.')
  return {
    async send({ to, subject, text, html }) {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      })
      if (!res.ok) throw new Error(`slauth: Resend said ${res.status}: ${(await res.text()).slice(0, 200)}`)
    },
  }
}
