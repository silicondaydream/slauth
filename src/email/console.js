/**
 * Prints sign-in codes (and links) to the console instead of emailing them. The default
 * while you build, so there's nothing to set up to try slauth.
 *
 * @returns {import('../index.js').EmailSender}
 */
export function consoleEmail() {
  return {
    async send({ to, code, link, appName, kind = 'sign-in', subject }) {
      if (kind === 'sign-in') console.log(`\n  🦥 slauth: ${appName} sign-in code for ${to} is ${code}${link ? `\n     or open ${link}` : ''}\n`)
      else console.log(`\n  🦥 slauth: email to ${to}: ${subject}${code ? `\n     code: ${code}` : ''}${link ? `\n     link: ${link}` : ''}\n`)
    },
  }
}
