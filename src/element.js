import { createClient } from './client.js'

/**
 * <slauth-sign-in>: a drop-in sign-in box. Email → 6-digit code → signed in, with
 * "Sign in with a passkey" and an offer to add one afterwards. Works in any framework
 * (it's a plain custom element) and is themed with CSS variables:
 *
 *   slauth-sign-in {
 *     --slauth-accent: #f59e0b;  --slauth-ink: #2b2118;  --slauth-bg: #fff;
 *     --slauth-radius: 14px;     --slauth-font: inherit;
 *   }
 *
 * Attributes: base-path (default /auth), app-name, redirect (where to go once signed in),
 * no-passkeys (email codes only).
 * Fires `slauth:signed-in` with `{ detail: { user } }`.
 *
 *   import 'slauthjs/element'
 *   <slauth-sign-in app-name="Planda" redirect="/"></slauth-sign-in>
 */

const STYLE = `
:host { display: block; font-family: var(--slauth-font, inherit); color: var(--slauth-ink, #2b2118); max-width: 360px; }
.card { background: var(--slauth-bg, #fff); border: 2px solid var(--slauth-ink, #2b2118); border-radius: var(--slauth-radius, 14px); padding: 22px; box-shadow: 4px 4px 0 var(--slauth-ink, #2b2118); }
h2 { margin: 0 0 4px; font-size: 20px; line-height: 1.2; }
p { margin: 0 0 14px; font-size: 14px; opacity: .8; }
label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
input { box-sizing: border-box; width: 100%; font: inherit; font-size: 16px; padding: 10px 12px; border: 2px solid var(--slauth-ink, #2b2118); border-radius: calc(var(--slauth-radius, 14px) - 6px); background: transparent; color: inherit; }
input.code { letter-spacing: .4em; text-align: center; font-size: 22px; font-weight: 700; }
input:focus { outline: 3px solid var(--slauth-accent, #f59e0b); outline-offset: 1px; }
button { font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; border-radius: calc(var(--slauth-radius, 14px) - 6px); padding: 10px 14px; width: 100%; margin-top: 12px; }
.primary { background: var(--slauth-accent, #f59e0b); color: var(--slauth-ink, #2b2118); border: 2px solid var(--slauth-ink, #2b2118); }
.primary:active { transform: translate(1px, 1px); }
.ghost { background: transparent; color: inherit; border: 2px dashed currentColor; opacity: .85; }
.link { background: none; border: 0; padding: 4px; width: auto; font-weight: 600; text-decoration: underline; opacity: .75; }
button:disabled { opacity: .5; cursor: default; }
.error { color: #c2410c; font-size: 13px; font-weight: 600; min-height: 18px; margin: 8px 0 0; }
.row { display: flex; justify-content: space-between; margin-top: 8px; }
`

class SlauthSignIn extends HTMLElement {
  connectedCallback() {
    this.auth = createClient({ basePath: this.getAttribute('base-path') ?? '/auth' })
    this.appName = this.getAttribute('app-name') ?? ''
    this.state = { step: 'email', email: '', error: '', busy: false }
    this.attachShadow({ mode: 'open' })
    this.render()
  }

  set(patch) {
    this.state = { ...this.state, ...patch }
    this.render()
  }

  async run(action) {
    this.set({ busy: true, error: '' })
    try {
      await action()
    } catch (error) {
      this.set({ error: error.message ?? 'Something went wrong.' })
    } finally {
      if (this.isConnected) this.set({ busy: false })
    }
  }

  done(user) {
    // Back to the start, ready for the next time it's shown (e.g. after signing out).
    this.state = { step: 'email', email: '', error: '', busy: false }
    this.render()
    this.dispatchEvent(new CustomEvent('slauth:signed-in', { detail: { user }, bubbles: true, composed: true }))
    const to = this.getAttribute('redirect')
    if (to) window.location.assign(to)
  }

  render() {
    const { step, email, error, busy } = this.state
    const passkeys = !this.hasAttribute('no-passkeys') && this.auth.passkey.supported()
    const name = this.appName ? ` to ${escape(this.appName)}` : ''
    const views = {
      email: `
        <h2>Sign in${name}</h2>
        <p>We'll email you a 6-digit code. No password needed.</p>
        <form data-on="email">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email webauthn" required value="${escape(email)}" />
          <button class="primary" ${busy ? 'disabled' : ''}>Email me a code</button>
        </form>
        ${passkeys ? `<button class="ghost" data-on="passkey" ${busy ? 'disabled' : ''}>Sign in with a passkey</button>` : ''}`,
      code: `
        <h2>Check your email</h2>
        <p>We sent a code to <strong>${escape(email)}</strong>.</p>
        <form data-on="code">
          <label for="code">Code</label>
          <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
          <button class="primary" ${busy ? 'disabled' : ''}>Sign in</button>
        </form>
        <div class="row"><button class="link" data-on="back">Use another email</button><button class="link" data-on="resend">Send again</button></div>`,
      offer: `
        <h2>You're in 🦥</h2>
        <p>Add a passkey and next time it's just Face ID, Touch ID or your PIN.</p>
        <button class="primary" data-on="add" ${busy ? 'disabled' : ''}>Add a passkey</button>
        <button class="link" data-on="skip">Not now</button>`,
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card" part="card">${views[step]}<p class="error" role="alert">${escape(error)}</p></div>`

    const on = (key, handler) => {
      const el = this.shadowRoot.querySelector(`[data-on="${key}"]`)
      el?.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', (event) => {
        event.preventDefault()
        handler()
      })
    }
    // Read inputs before run(): it re-renders the form, which would empty them.
    on('email', () => {
      const value = this.shadowRoot.getElementById('email').value.trim()
      this.set({ email: value })
      return this.run(async () => {
        await this.auth.email.start(value)
        this.set({ step: 'code' })
        this.shadowRoot.getElementById('code')?.focus()
      })
    })
    on('code', () => {
      const code = this.shadowRoot.getElementById('code').value
      return this.run(async () => {
        const { user } = await this.auth.email.verify(email, code)
        this.user = user
        if (passkeys) this.set({ step: 'offer' })
        else this.done(user)
      })
    })
    on('passkey', () => this.run(async () => this.done((await this.auth.passkey.signIn()).user)))
    on('back', () => this.set({ step: 'email', error: '' }))
    on('resend', () => this.run(() => this.auth.email.start(email)))
    on('add', () =>
      this.run(async () => {
        await this.auth.passkey.register()
        this.done(this.user)
      }),
    )
    on('skip', () => this.done(this.user))
    this.shadowRoot.querySelector('input')?.focus({ preventScroll: true })
  }
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

if (typeof customElements !== 'undefined' && !customElements.get('slauth-sign-in')) {
  customElements.define('slauth-sign-in', SlauthSignIn)
}
