/** Shared by <slauth-sign-in> and <slauth-account>. */

export const STYLE = `
:host { display: block; font-family: var(--slauth-font, inherit); color: var(--slauth-ink, #2b2118); max-width: 360px; }
.card { background: var(--slauth-bg, #fff); border: 2px solid var(--slauth-ink, #2b2118); border-radius: var(--slauth-radius, 14px); padding: 22px; box-shadow: 4px 4px 0 var(--slauth-ink, #2b2118); }
h2 { margin: 0 0 4px; font-size: 20px; line-height: 1.2; }
h3 { margin: 18px 0 8px; font-size: 15px; }
p { margin: 0 0 14px; font-size: 14px; opacity: .8; }
label { display: block; font-size: 13px; font-weight: 600; margin: 10px 0 6px; }
input { box-sizing: border-box; width: 100%; font: inherit; font-size: 16px; padding: 10px 12px; border: 2px solid var(--slauth-ink, #2b2118); border-radius: calc(var(--slauth-radius, 14px) - 6px); background: transparent; color: inherit; }
input.code { letter-spacing: .4em; text-align: center; font-size: 22px; font-weight: 700; }
input:focus, button:focus-visible, a:focus-visible { outline: 3px solid var(--slauth-accent, #f59e0b); outline-offset: 1px; }
button, a.button { box-sizing: border-box; display: block; text-align: center; text-decoration: none; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; border-radius: calc(var(--slauth-radius, 14px) - 6px); padding: 10px 14px; width: 100%; margin-top: 12px; }
.primary { background: var(--slauth-accent, #f59e0b); color: var(--slauth-accent-ink, var(--slauth-ink, #2b2118)); border: 2px solid var(--slauth-ink, #2b2118); }
.primary:active { transform: translate(1px, 1px); }
.ghost, a.button { background: transparent; color: inherit; border: 2px solid currentColor; }
.ghost.dashed { border-style: dashed; opacity: .85; }
.providers { margin-top: 14px; }
.providers a.button { margin-top: 8px; }
.providers a.button:first-child { margin-top: 0; }
.or { display: flex; align-items: center; gap: 10px; margin: 16px 0 4px; font-size: 12px; opacity: .6; }
.or::before, .or::after { content: ''; flex: 1; border-top: 2px dashed currentColor; }
.link { background: none; border: 0; padding: 4px; width: auto; display: inline; margin: 0; font-weight: 600; text-decoration: underline; opacity: .75; color: inherit; }
button:disabled { opacity: .5; cursor: default; }
.error { color: var(--slauth-error, #c2410c); font-size: 13px; font-weight: 600; min-height: 18px; margin: 8px 0 0; opacity: 1; }
.challenge { margin: 10px 0 2px; min-height: 0; }
.row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.codes { font-family: ui-monospace, monospace; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 14px; margin: 0 0 12px; }
.list { list-style: none; padding: 0; margin: 0 0 8px; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 2px dashed color-mix(in srgb, currentColor 18%, transparent); font-size: 14px; }
.list li span { overflow: hidden; text-overflow: ellipsis; }
.muted { opacity: .65; font-size: 12px; }
`

/** What a slauth error code means to a person. */
export const MESSAGES = {
  'oauth-cancelled': 'Sign-in was cancelled.',
  'oauth-failed': "Couldn't sign in with that account. Please try again.",
  'oauth-state': 'That sign-in took too long. Please try again.',
  'email-not-verified': "That account's email isn't verified, so it can't be used to sign in. Use an email code instead.",
  'not-allowed': "That email isn't on the list for this app.",
  'account-in-use': "That account is already linked to someone else's sign-in.",
  banned: "This account can't sign in.",
  'signed-out': 'Please sign in first.',
  'reauth-required': 'Please sign in again to do that.',
  'challenge-failed': 'Please complete the check and try again.',
}

export function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
