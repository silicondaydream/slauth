import { createClient } from './client.js'
import { MESSAGES, STYLE, escape } from './ui.js'

/**
 * <slauth-sign-in>: a drop-in sign-in box. It asks the server what's turned on and
 * offers it: "Continue with GitHub/Google/…", email → 6-digit code, a password, a
 * passkey, then the two-factor code for people who set one up, and an offer to add a
 * passkey afterwards. Works in any framework (it's a plain custom element) and is themed
 * with CSS variables:
 *
 *   slauth-sign-in {
 *     --slauth-accent: #f59e0b;  --slauth-ink: #2b2118;  --slauth-bg: #fff;
 *     --slauth-radius: 14px;     --slauth-font: inherit;
 *   }
 *
 * Attributes: base-path (default /auth), app-name, redirect (where to go once signed in),
 * mode ("sign-up" to start on the password sign-up form), no-passkeys (no passkey
 * button or offer).
 * Fires `slauth:signed-in` with `{ detail: { user } }`.
 *
 *   import 'slauthjs/element'
 *   <slauth-sign-in app-name="Planda" redirect="/"></slauth-sign-in>
 */

class SlauthSignIn extends HTMLElement {
  connectedCallback() {
    this.auth = createClient({ basePath: this.getAttribute('base-path') ?? '/auth' })
    this.appName = this.getAttribute('app-name') ?? ''
    this.config = { providers: [], passwords: false, passkeys: true }
    this.state = { step: 'email', mode: this.getAttribute('mode') === 'sign-up' ? 'sign-up' : 'code', email: '', error: '', busy: false, recovery: false }
    this.attachShadow({ mode: 'open' })
    this.readUrl()
    this.render()
    this.load()
  }

  /** Errors and the two-factor step can arrive in the URL, after a provider sends people back. */
  readUrl() {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('slauth_error')
    if (error) this.state.error = MESSAGES[error] ?? 'Something went wrong. Please try again.'
    if (params.get('slauth_step') === 'two-factor') this.state.step = 'two-factor'
    this.afterRedirect = params.get('redirect')
    this.invite = params.get('slauth_invite')
    if (error || params.has('slauth_step')) {
      for (const key of ['slauth_error', 'slauth_step']) params.delete(key)
      const query = params.toString()
      window.history.replaceState(window.history.state, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)
    }
  }

  async load() {
    try {
      const [config, session] = await Promise.all([this.auth.config(), this.auth.session()])
      this.config = config
      if (session.twoFactor === 'pending') this.state.step = 'two-factor'
      if (this.state.mode === 'sign-up' && !config.passwords) this.state.mode = 'code'
      this.render()
    } catch {
      // The box still works with email codes.
    }
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
      this.set({ error: MESSAGES[error.code] ?? error.message ?? 'Something went wrong.' })
    } finally {
      if (this.isConnected) this.set({ busy: false })
    }
  }

  /** After the first step: the two-factor code, the passkey offer, or done. */
  async signedIn(result, { offer = true } = {}) {
    if (result.twoFactor) return this.set({ step: 'two-factor', recovery: false })
    this.user = result.user
    if (offer && this.passkeys()) return this.set({ step: 'offer' })
    return this.done(result.user)
  }

  async done(user) {
    if (this.invite && this.config.organizations) await this.auth.orgs.accept(this.invite).catch(() => {})
    // Back to the start, ready for the next time it's shown (e.g. after signing out).
    this.state = { step: 'email', mode: 'code', email: '', error: '', busy: false, recovery: false }
    this.render()
    this.dispatchEvent(new CustomEvent('slauth:signed-in', { detail: { user }, bubbles: true, composed: true }))
    const to = this.getAttribute('redirect') ?? this.afterRedirect
    if (to) window.location.assign(to)
  }

  passkeys() {
    return !this.hasAttribute('no-passkeys') && this.config.passkeys !== false && this.auth.passkey.supported()
  }

  render() {
    const { step, mode, email, error, busy, recovery } = this.state
    const { providers = [], passwords } = this.config
    const app = this.appName || (this.config.appName !== 'your app' ? (this.config.appName ?? '') : '')
    const name = app ? ` to ${escape(app)}` : ''
    const off = busy ? 'disabled' : ''
    const redirect = this.getAttribute('redirect') ?? window.location.pathname + window.location.search
    const providerButtons = providers.length
      ? `<div class="providers">${providers.map((p) => `<a class="button" part="provider" href="${escape(this.auth.oauth.url(p.id, { redirect }))}">Continue with ${escape(p.name)}</a>`).join('')}</div><div class="or">or</div>`
      : ''

    const emailViews = {
      code: `
        <h2>Sign in${name}</h2>
        ${providerButtons}
        <p>We'll email you a 6-digit code. No password needed.</p>
        <form data-on="email">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email webauthn" required value="${escape(email)}" />
          <button class="primary" ${off}>Email me a code</button>
        </form>
        ${this.passkeys() ? `<button class="ghost dashed" data-on="passkey" ${off}>Sign in with a passkey</button>` : ''}
        ${passwords ? `<div class="row"><button class="link" data-on="mode-password">Use a password</button><button class="link" data-on="mode-sign-up">Create an account</button></div>` : ''}`,
      password: `
        <h2>Sign in${name}</h2>
        ${providerButtons}
        <form data-on="password">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="username webauthn" required value="${escape(email)}" />
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" required />
          <button class="primary" ${off}>Sign in</button>
        </form>
        <div class="row"><button class="link" data-on="mode-code">Email me a code instead</button><button class="link" data-on="mode-code">Forgot password?</button></div>`,
      'sign-up': `
        <h2>Create an account${name}</h2>
        ${providerButtons}
        <form data-on="sign-up">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" required value="${escape(email)}" />
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="new-password" minlength="8" required />
          <button class="primary" ${off}>Create account</button>
        </form>
        <div class="row"><button class="link" data-on="mode-password">I have an account</button></div>`,
    }

    const views = {
      email: emailViews[mode] ?? emailViews.code,
      code: `
        <h2>Check your email</h2>
        <p>We sent a code to <strong>${escape(email)}</strong>${this.config.magicLinks ? ', with a link you can tap instead' : ''}.</p>
        <form data-on="code">
          <label for="code">Code</label>
          <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
          <button class="primary" ${off}>${mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="row"><button class="link" data-on="back">Use another email</button><button class="link" data-on="resend">Send again</button></div>`,
      'two-factor': recovery
        ? `
        <h2>Use a recovery code</h2>
        <p>One of the codes you saved when you turned on two-factor sign-in. Each works once.</p>
        <form data-on="two-factor">
          <label for="code">Recovery code</label>
          <input id="code" autocomplete="off" autocapitalize="off" spellcheck="false" required />
          <button class="primary" ${off}>Continue</button>
        </form>
        <div class="row"><button class="link" data-on="use-app">Use the app instead</button></div>`
        : `
        <h2>Two-factor sign-in</h2>
        <p>Enter the 6-digit code from your authenticator app.</p>
        <form data-on="two-factor">
          <label for="code">Code</label>
          <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required />
          <button class="primary" ${off}>Continue</button>
        </form>
        <div class="row"><button class="link" data-on="use-recovery">Lost your phone?</button><button class="link" data-on="back">Start over</button></div>`,
      offer: `
        <h2>You're in 🦥</h2>
        <p>Add a passkey and next time it's just Face ID, Touch ID or your PIN.</p>
        <button class="primary" data-on="add" ${off}>Add a passkey</button>
        <button class="link" data-on="skip">Not now</button>`,
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="card" part="card">${views[step]}<p class="error" role="alert">${escape(error)}</p></div>`

    const on = (key, handler) => {
      for (const el of this.shadowRoot.querySelectorAll(`[data-on="${key}"]`)) {
        el.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', (event) => {
          event.preventDefault()
          handler()
        })
      }
    }
    const value = (id) => this.shadowRoot.getElementById(id)?.value ?? ''
    // Read inputs before run(): it re-renders the form, which would empty them.
    on('email', () => {
      const typed = value('email').trim()
      this.set({ email: typed })
      return this.run(async () => {
        await this.auth.email.start(typed, { redirect: this.getAttribute('redirect') ?? undefined })
        this.set({ step: 'code' })
        this.shadowRoot.getElementById('code')?.focus()
      })
    })
    on('password', () => {
      const typed = value('email').trim()
      const password = value('password')
      this.set({ email: typed })
      return this.run(async () => this.signedIn(await this.auth.password.signIn(typed, password)))
    })
    on('sign-up', () => {
      const typed = value('email').trim()
      const password = value('password')
      this.set({ email: typed })
      return this.run(async () => {
        await this.auth.password.signUp(typed, password)
        this.set({ step: 'code' })
      })
    })
    on('code', () => {
      const code = value('code')
      return this.run(async () => this.signedIn(await this.auth.email.verify(email, code)))
    })
    on('two-factor', () => {
      const code = value('code')
      return this.run(async () => this.signedIn(await this.auth.twoFactor.verify(recovery ? { recoveryCode: code } : { code }), { offer: false }))
    })
    on('passkey', () => this.run(async () => this.signedIn(await this.auth.passkey.signIn(), { offer: false })))
    on('mode-code', () => this.set({ mode: 'code', error: '' }))
    on('mode-password', () => this.set({ mode: 'password', error: '' }))
    on('mode-sign-up', () => this.set({ mode: 'sign-up', error: '' }))
    on('use-recovery', () => this.set({ recovery: true, error: '' }))
    on('use-app', () => this.set({ recovery: false, error: '' }))
    on('back', () => this.set({ step: 'email', error: '' }))
    on('resend', () => this.run(() => this.auth.email.start(email)))
    on('add', () =>
      this.run(async () => {
        await this.auth.passkey.register()
        await this.done(this.user)
      }),
    )
    on('skip', () => this.done(this.user))
    const first = this.shadowRoot.querySelector(step === 'email' && email ? '#password, input' : 'input')
    first?.focus({ preventScroll: true })
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('slauth-sign-in')) {
  customElements.define('slauth-sign-in', SlauthSignIn)
}
