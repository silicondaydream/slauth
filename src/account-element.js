import { createClient } from './client.js'
import { MESSAGES, STYLE, escape } from './ui.js'

/**
 * <slauth-account>: an account page in one tag. Name and email, passkeys, password,
 * linked providers, two-factor, signed-in devices, organization invitations, and
 * signing out or deleting the account. It shows only what the server has turned on,
 * and is themed with the same CSS variables as <slauth-sign-in>.
 *
 * Attributes: base-path (default /auth), signed-out (where to go after signing out or
 * deleting the account; default "/").
 *
 *   import 'slauthjs/account'
 *   <slauth-account></slauth-account>
 */
class SlauthAccount extends HTMLElement {
  connectedCallback() {
    this.auth = createClient({ basePath: this.getAttribute('base-path') ?? '/auth' })
    this.data = null
    this.ui = { error: '', notice: '', busy: false, editing: null, setup: null, recoveryCodes: null, newEmail: '' }
    this.attachShadow({ mode: 'open' })
    this.render()
    this.load()
  }

  async load() {
    try {
      const [session, config] = await Promise.all([this.auth.session(), this.auth.config()])
      if (!session.user) {
        this.data = { signedOut: true }
        return this.render()
      }
      const [passkeys, accounts, sessions, invites] = await Promise.all([
        config.passkeys ? this.auth.passkey.list() : { passkeys: [] },
        this.auth.accounts.list(),
        this.auth.sessions.list(),
        config.organizations ? this.auth.orgs.invites() : { invites: [] },
      ])
      const orgs = config.organizations ? (await this.auth.orgs.list()).orgs : []
      this.data = { user: session.user, config, passkeys: passkeys.passkeys, ...accounts, sessions: sessions.sessions, invites: invites.invites, orgs }
    } catch (error) {
      this.ui.error = error.message
    }
    this.render()
  }

  async run(action, notice = '') {
    this.ui = { ...this.ui, busy: true, error: '', notice: '' }
    this.render()
    try {
      await action()
      this.ui.notice = notice
      await this.load()
    } catch (error) {
      this.ui.error = MESSAGES[error.code] ?? error.message ?? 'Something went wrong.'
    } finally {
      this.ui.busy = false
      if (this.isConnected) this.render()
    }
  }

  leave() {
    window.location.assign(this.getAttribute('signed-out') ?? '/')
  }

  render() {
    const d = this.data
    const { error, notice, busy, editing, setup, recoveryCodes } = this.ui
    const off = busy ? 'disabled' : ''
    const date = (ms) => new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
    let body
    if (!d) body = '<p>Loading…</p>'
    else if (d.signedOut) body = '<h2>Your account</h2><p>Please sign in first.</p>'
    else {
      const { user, config } = d
      const providerRows = config.providers
        .map((p) => {
          const linked = d.accounts.find((a) => a.provider === p.id)
          return `<li><span>${escape(p.name)}${linked ? ` <span class="muted">${escape(linked.email ?? linked.username ?? '')}</span>` : ''}</span>${
            linked ? `<button class="link" data-on="unlink" data-id="${escape(p.id)}" ${off}>Disconnect</button>` : `<button class="link" data-on="link" data-id="${escape(p.id)}" ${off}>Connect</button>`
          }</li>`
        })
        .join('')
      body = `
        <h2>Your account</h2>
        <p>${escape(user.email)}</p>

        <h3>Profile</h3>
        <form data-on="name">
          <label for="name">Name</label>
          <input id="name" autocomplete="name" value="${escape(user.name ?? '')}" />
          <button class="ghost" ${off}>Save name</button>
        </form>
        ${
          editing === 'email'
            ? this.ui.newEmail
              ? `<form data-on="email-code"><label for="email-code">Code sent to ${escape(this.ui.newEmail)}</label><input id="email-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required /><button class="primary" ${off}>Confirm new email</button></form>`
              : `<form data-on="email"><label for="email">New email</label><input id="email" type="email" autocomplete="email" required /><button class="primary" ${off}>Send a code</button></form>`
            : `<div class="row"><button class="link" data-on="edit-email">Change email</button></div>`
        }

        ${
          config.passkeys
            ? `<h3>Passkeys</h3>
        <ul class="list">${d.passkeys.map((pk) => `<li><span>${escape(pk.name)} <span class="muted">added ${date(pk.createdAt)}</span></span><button class="link" data-on="remove-passkey" data-id="${escape(pk.id)}" ${off}>Remove</button></li>`).join('') || '<li><span class="muted">None yet.</span></li>'}</ul>
        ${this.auth.passkey.supported() ? `<button class="ghost dashed" data-on="add-passkey" ${off}>Add a passkey</button>` : ''}`
            : ''
        }

        ${
          config.passwords || config.providers.length
            ? `<h3>Ways to sign in</h3>
        <ul class="list">
          ${config.passwords ? `<li><span>Password <span class="muted">${d.password ? 'set' : 'not set'}</span></span><button class="link" data-on="edit-password">${d.password ? 'Change' : 'Set'}</button></li>` : ''}
          ${providerRows}
        </ul>
        ${
          editing === 'password'
            ? `<form data-on="password">${d.password ? '<label for="current">Current password</label><input id="current" type="password" autocomplete="current-password" />' : ''}<label for="password">New password</label><input id="password" type="password" autocomplete="new-password" minlength="8" required /><button class="primary" ${off}>Save password</button></form>`
            : ''
        }`
            : ''
        }

        ${
          config.twoFactor
            ? `<h3>Two-factor sign-in</h3>
        ${
          recoveryCodes
            ? `<p>Save these recovery codes somewhere safe. Each one works once if you lose your phone.</p><div class="codes">${recoveryCodes.map((c) => `<span>${escape(c)}</span>`).join('')}</div><button class="ghost" data-on="codes-done">I've saved them</button>`
            : setup
              ? `<p>Add this to your authenticator app (<a href="${escape(setup.uri)}">open in app</a>), or type the key:</p><p class="codes"><span>${escape(setup.secret.replace(/(.{4})/g, '$1 ').trim())}</span></p>
          <form data-on="enable-2fa"><label for="totp">Code from the app</label><input id="totp" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required /><button class="primary" ${off}>Turn on</button></form>`
              : d.twoFactor
                ? `<p>On: signing in asks for a code from your authenticator app.</p>
          <form data-on="disable-2fa"><label for="totp">Code from the app (or a recovery code) to turn it off</label><input id="totp" autocomplete="one-time-code" required /><button class="ghost" ${off}>Turn off</button></form>`
                : `<p>Off. Turn it on to ask for a code from an authenticator app when you sign in.</p><button class="ghost" data-on="setup-2fa" ${off}>Set up</button>`
        }`
            : ''
        }

        <h3>Signed-in devices</h3>
        <ul class="list">${d.sessions
          .map((s) => `<li><span>${escape(device(s.userAgent))} <span class="muted">${s.current ? 'this device' : `since ${date(s.createdAt)}`}</span></span>${s.current ? '' : `<button class="link" data-on="revoke" data-id="${escape(s.id)}" ${off}>Sign out</button>`}</li>`)
          .join('')}</ul>
        ${d.sessions.length > 1 ? `<button class="ghost" data-on="revoke-others" ${off}>Sign out everywhere else</button>` : ''}

        ${
          config.organizations && (d.invites.length || d.orgs.length)
            ? `<h3>Organizations</h3>
        <ul class="list">
          ${d.invites.map((i) => `<li><span>${escape(i.org.name)} <span class="muted">invited as ${escape(i.role)}</span></span><span><button class="link" data-on="accept" data-id="${escape(i.id)}" ${off}>Join</button> <button class="link" data-on="decline" data-id="${escape(i.id)}" ${off}>Decline</button></span></li>`).join('')}
          ${d.orgs.map((o) => `<li><span>${escape(o.name)}</span><span class="muted">${escape(o.role)}</span></li>`).join('')}
        </ul>`
            : ''
        }

        <h3>Leave</h3>
        <button class="ghost" data-on="sign-out" ${off}>Sign out</button>
        ${editing === 'delete' ? `<p>This deletes your account and everything in it, for good.</p><button class="primary" data-on="delete" ${off}>Yes, delete my account</button>` : `<div class="row"><button class="link" data-on="edit-delete">Delete my account</button></div>`}`
    }
    this.shadowRoot.innerHTML = `<style>${STYLE}:host { max-width: 480px; }</style><div class="card" part="card">${body}${notice ? `<p role="status">${escape(notice)}</p>` : ''}<p class="error" role="alert">${escape(error)}</p></div>`

    const on = (key, handler) => {
      for (const el of this.shadowRoot.querySelectorAll(`[data-on="${key}"]`)) {
        el.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', (event) => {
          event.preventDefault()
          handler(el.dataset.id)
        })
      }
    }
    const value = (id) => this.shadowRoot.getElementById(id)?.value ?? ''
    const edit = (what) => ((this.ui = { ...this.ui, editing: this.ui.editing === what ? null : what, error: '', newEmail: '' }), this.render())

    on('name', () => {
      const name = value('name')
      return this.run(() => this.auth.user.update({ name }), 'Saved.')
    })
    on('edit-email', () => edit('email'))
    on('email', () => {
      const email = value('email').trim()
      return this.run(async () => {
        await this.auth.email.change.start(email)
        this.ui.newEmail = email
      })
    })
    on('email-code', () => {
      const code = value('email-code')
      return this.run(async () => {
        await this.auth.email.change.verify(this.ui.newEmail, code)
        this.ui = { ...this.ui, editing: null, newEmail: '' }
      }, 'Your email is changed.')
    })
    on('add-passkey', () => this.run(() => this.auth.passkey.register(), 'Passkey added.'))
    on('remove-passkey', (id) => this.run(() => this.auth.passkey.remove(id)))
    on('edit-password', () => edit('password'))
    on('password', () => {
      const current = value('current') || undefined
      const password = value('password')
      return this.run(async () => {
        await this.auth.password.set(password, current)
        this.ui.editing = null
      }, 'Password saved.')
    })
    on('link', (id) => this.auth.oauth.link(id, { redirect: window.location.pathname }))
    on('unlink', (id) => this.run(() => this.auth.accounts.unlink(id)))
    on('setup-2fa', () =>
      this.run(async () => {
        this.ui.setup = await this.auth.twoFactor.setup()
      }),
    )
    on('enable-2fa', () => {
      const code = value('totp')
      return this.run(async () => {
        const { recoveryCodes: codes } = await this.auth.twoFactor.enable(code)
        this.ui = { ...this.ui, setup: null, recoveryCodes: codes }
      })
    })
    on('codes-done', () => ((this.ui.recoveryCodes = null), this.render()))
    on('disable-2fa', () => {
      const code = value('totp').trim()
      return this.run(() => this.auth.twoFactor.disable(/^\d{6}$/.test(code) ? { code } : { recoveryCode: code }), 'Two-factor sign-in is off.')
    })
    on('revoke', (id) => this.run(() => this.auth.sessions.revoke(id)))
    on('revoke-others', () => this.run(() => this.auth.sessions.revokeOthers(), 'Signed out everywhere else.'))
    on('accept', (id) => this.run(() => this.auth.orgs.accept(id)))
    on('decline', (id) => this.run(() => this.auth.orgs.decline(id)))
    on('sign-out', () => this.run(async () => (await this.auth.signOut(), this.leave())))
    on('edit-delete', () => edit('delete'))
    on('delete', () => this.run(async () => (await this.auth.user.delete(), this.leave())))
  }
}

/** "Chrome on macOS" from a user agent, roughly. */
function device(ua) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

if (typeof customElements !== 'undefined' && !customElements.get('slauth-account')) {
  customElements.define('slauth-account', SlauthAccount)
}
