/**
 * Prints sign-in codes to the console instead of emailing them. The default while
 * you build, so there's nothing to set up to try slauth.
 *
 * @returns {import('../index.js').EmailSender}
 */
export function consoleEmail() {
  return {
    async send({ to, code, appName }) {
      console.log(`\n  🦥 slauth: ${appName} sign-in code for ${to} is ${code}\n`)
    },
  }
}
