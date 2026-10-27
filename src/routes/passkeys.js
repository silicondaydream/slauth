import { PasskeyError, readChallenge, verifyAuthentication, verifyRegistration } from '../passkey/webauthn.js'
import { base64Url, json } from '../util.js'

const CHALLENGE_SECONDS = 5 * 60

/**
 * Passkeys (WebAuthn).
 *
 *   challenge:<challenge>  { type, userId? }   (lives 5 minutes, single use)
 *   passkey:<id>           { id, publicKey, alg, counter, userId, name, createdAt, lastUsedAt }
 *   passkeys:<userId>      [id, ...]
 *
 * @param {object} app  the shared context from core.js
 */
export function passkeyRoutes(app) {
  const { store, users, passkeys } = app

  const expect = (url, challenge) => ({
    rpId: passkeys.rpId ?? url.hostname,
    origin: passkeys.origin ?? app.origins ?? url.origin,
    challenge,
    requireUserVerification: passkeys.userVerification === 'required',
  })

  async function takeChallenge(clientDataJSON, type) {
    const challenge = readChallenge(clientDataJSON)
    if (!challenge) throw new PasskeyError('The response has no challenge.')
    const stored = await store.get(`challenge:${challenge}`)
    // Single use, whatever happens next.
    await store.delete(`challenge:${challenge}`)
    if (!stored || stored.type !== type) throw new PasskeyError('That passkey request expired. Try again.')
    return { challenge, stored }
  }

  async function newChallenge(value) {
    const challenge = base64Url(crypto.getRandomValues(new Uint8Array(32)))
    await store.put(`challenge:${challenge}`, value, { ttl: CHALLENGE_SECONDS })
    return challenge
  }

  return async function route({ route, method, request, url, body }) {
    if (!route.startsWith('passkey') && route !== 'passkeys') return
    if (passkeys === false) return json({ error: 'Passkeys are turned off.', code: 'not-found' }, 404)

    if (route === 'passkey/login/options' && method === 'POST') {
      const challenge = await newChallenge({ type: 'login' })
      return json({
        challenge,
        rpId: passkeys.rpId ?? url.hostname,
        timeout: CHALLENGE_SECONDS * 1000,
        userVerification: passkeys.userVerification ?? 'preferred',
        allowCredentials: [],
      })
    }

    if (route === 'passkey/login/verify' && method === 'POST') {
      const { credential } = await body()
      await takeChallenge(credential?.response?.clientDataJSON, 'login')
      const stored = typeof credential?.id === 'string' ? await store.get(`passkey:${credential.id}`) : null
      if (!stored) return json({ error: "This passkey isn't registered here.", code: 'passkey-unknown' }, 400)
      if (credential.response.userHandle && credential.response.userHandle !== base64Url(new TextEncoder().encode(stored.userId))) {
        throw new PasskeyError('This passkey belongs to someone else.')
      }
      const { counter } = await verifyAuthentication(credential, stored, expect(url, readChallenge(credential.response.clientDataJSON)))
      await store.put(`passkey:${stored.id}`, { ...stored, counter, lastUsedAt: Date.now() })
      const found = await users.byId(stored.userId)
      if (!found || !(await users.allowed(found.email, { method: 'passkey' }))) return json({ error: "You're not on the list for this app.", code: 'not-allowed' }, 403)
      return app.reply(await app.complete(found, request, { method: 'passkey' }), {}, request)
    }

    // Everything below is for someone already signed in.
    const me = await app.signedIn(request)
    if (me instanceof Response) return me
    const found = me.user
    const ids = (await store.get(`passkeys:${found.id}`)) ?? []

    if (route === 'passkey/register/options' && method === 'POST') {
      // A passkey is a way back in: only add one soon after signing in.
      if (!app.fresh(me.session)) return app.reauth()
      const challenge = await newChallenge({ type: 'register', userId: found.id })
      return json({
        challenge,
        rp: { id: passkeys.rpId ?? url.hostname, name: passkeys.rpName ?? app.appName },
        user: { id: base64Url(new TextEncoder().encode(found.id)), name: found.email, displayName: found.name ?? found.email },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: CHALLENGE_SECONDS * 1000,
        attestation: 'none',
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: passkeys.userVerification ?? 'preferred' },
        excludeCredentials: ids.map((id) => ({ type: 'public-key', id })),
      })
    }

    if (route === 'passkey/register/verify' && method === 'POST') {
      const { credential, name } = await body()
      const { challenge, stored } = await takeChallenge(credential?.response?.clientDataJSON, 'register')
      if (stored.userId !== found.id) throw new PasskeyError('That passkey request was for someone else.')
      const verified = await verifyRegistration(credential, expect(url, challenge))
      if (await store.get(`passkey:${verified.id}`)) return json({ error: 'That passkey is already registered.', code: 'passkey-exists' }, 409)
      const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : `Passkey added ${new Date().toISOString().slice(0, 10)}`
      await store.put(`passkey:${verified.id}`, { ...verified, userId: found.id, name: label, createdAt: Date.now(), lastUsedAt: null })
      await store.put(`passkeys:${found.id}`, [...ids, verified.id])
      return json({ ok: true, passkey: { id: verified.id, name: label } })
    }

    if (route === 'passkeys' && method === 'GET') {
      const list = []
      for (const id of ids) {
        const pk = await store.get(`passkey:${id}`)
        if (pk) list.push({ id: pk.id, name: pk.name, createdAt: pk.createdAt, lastUsedAt: pk.lastUsedAt })
      }
      return json({ passkeys: list })
    }

    if (route === 'passkey/rename' && method === 'POST') {
      const { id, name } = await body()
      if (!ids.includes(id)) return json({ error: 'No such passkey.', code: 'passkey-unknown' }, 404)
      if (typeof name !== 'string' || !name.trim()) return json({ error: 'Give it a name.', code: 'bad-request' }, 400)
      const pk = await store.get(`passkey:${id}`)
      await store.put(`passkey:${id}`, { ...pk, name: name.trim().slice(0, 60) })
      return json({ ok: true })
    }

    if (route === 'passkey/delete' && method === 'POST') {
      const { id } = await body()
      if (!ids.includes(id)) return json({ error: 'No such passkey.', code: 'passkey-unknown' }, 404)
      await store.delete(`passkey:${id}`)
      await store.put(`passkeys:${found.id}`, ids.filter((x) => x !== id))
      return json({ ok: true })
    }

    return json({ error: 'Not found.', code: 'not-found' }, 404)
  }
}
