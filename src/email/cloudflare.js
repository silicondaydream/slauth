/**
 * Sends codes with Cloudflare Email Service, through a `send_email` binding in your
 * wrangler config:
 *
 *   "send_email": [{ "name": "EMAIL" }]
 *
 * @param {{ send(message: { to: string, from: string, subject: string, text: string, html: string }): Promise<unknown> }} binding  e.g. env.EMAIL
 * @param {{ from: string }} options  a sender on a domain set up for Email Service
 * @returns {import('../index.js').EmailSender}
 */
export function cloudflareEmail(binding, { from }) {
  if (!binding?.send) throw new Error('slauth: cloudflareEmail() needs a send_email binding, e.g. env.EMAIL.')
  if (!from) throw new Error('slauth: cloudflareEmail() needs a from address.')
  return {
    async send({ to, subject, text, html }) {
      await binding.send({ to, from, subject, text, html })
    },
  }
}
