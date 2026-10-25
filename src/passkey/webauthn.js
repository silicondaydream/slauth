import { decodeCbor } from './cbor.js'
import { base64Url, concat, fromBase64Url, sha256 } from '../util.js'

/**
 * WebAuthn (passkeys), the parts a server needs, with Web Crypto only:
 *
 * - registration: check the browser's answer to navigator.credentials.create() and pull
 *   out the new public key;
 * - sign-in: check a signature from navigator.credentials.get() with that key.
 *
 * Attestation is not checked ("none"): for a personal project what matters is that the
 * same passkey signs in later, not which company made the authenticator.
 *
 * Supports ES256 (every platform passkey) and RS256 (some Windows Hello keys).
 */

export const ES256 = -7
export const RS256 = -257

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

/**
 * @typedef {{ origin: string | string[], rpId: string, challenge: string, requireUserVerification?: boolean }} Expect
 * @typedef {{ id: string, publicKey: JsonWebKey, alg: number, counter: number, transports?: string[] }} Credential
 */

/**
 * Checks a registration response.
 * @param {{ id: string, rawId?: string, type: string, response: { clientDataJSON: string, attestationObject: string, transports?: string[] } }} credential
 * @param {Expect} expect
 * @returns {Promise<Credential>}
 */
export async function verifyRegistration(credential, expect) {
  if (credential?.type !== 'public-key' || typeof credential.id !== 'string') throw new PasskeyError('Not a passkey.')
  await checkClientData(credential.response?.clientDataJSON, 'webauthn.create', expect)

  const attestation = decodeCbor(fromBase64Url(credential.response.attestationObject)).value
  if (!(attestation instanceof Map) || !(attestation.get('authData') instanceof Uint8Array)) {
    throw new PasskeyError('The attestation is malformed.')
  }
  const auth = await parseAuthData(attestation.get('authData'), expect)
  if (!auth.credentialId || !auth.coseKey) throw new PasskeyError('No new credential in the response.')
  if (base64Url(auth.credentialId) !== credential.id) throw new PasskeyError('Credential id mismatch.')

  const { jwk, alg } = coseToJwk(auth.coseKey)
  // Make sure Web Crypto accepts the key now, rather than at the first sign-in.
  await importKey(jwk, alg)
  const transports = Array.isArray(credential.response.transports) ? credential.response.transports.filter((t) => typeof t === 'string') : undefined
  return { id: credential.id, publicKey: jwk, alg, counter: auth.signCount, transports }
}

/**
 * Checks a sign-in (assertion) response against a stored credential.
 * @param {{ id: string, type: string, response: { clientDataJSON: string, authenticatorData: string, signature: string, userHandle?: string | null } }} assertion
 * @param {Credential} stored
 * @param {Expect} expect
 * @returns {Promise<{ counter: number }>}  the new signature counter to store
 */
export async function verifyAuthentication(assertion, stored, expect) {
  if (assertion?.type !== 'public-key' || assertion.id !== stored.id) throw new PasskeyError('Not the expected passkey.')
  const clientDataBytes = fromBase64Url(assertion.response?.clientDataJSON ?? '')
  await checkClientData(assertion.response.clientDataJSON, 'webauthn.get', expect)

  const authData = fromBase64Url(assertion.response.authenticatorData)
  const auth = await parseAuthData(authData, expect)

  const signed = concat(authData, await sha256(clientDataBytes))
  let signature = fromBase64Url(assertion.response.signature)
  const key = await importKey(stored.publicKey, stored.alg)
  if (stored.alg === ES256) signature = derToRaw(signature)
  const algorithm = stored.alg === ES256 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' }
  if (!(await crypto.subtle.verify(algorithm, key, signature, signed))) throw new PasskeyError('The signature is wrong.')

  // A counter that goes backwards means the passkey was copied. Many passkeys always
  // send 0, which means "no counter" and is fine.
  if ((auth.signCount !== 0 || stored.counter !== 0) && auth.signCount <= stored.counter) {
    throw new PasskeyError('This passkey may have been cloned (its counter went backwards).')
  }
  return { counter: auth.signCount }
}

export class PasskeyError extends Error {}

/** The challenge a response answers, so the server can look up what it sent. */
export function readChallenge(clientDataJSON) {
  try {
    const challenge = JSON.parse(new TextDecoder().decode(fromBase64Url(clientDataJSON))).challenge
    return typeof challenge === 'string' ? challenge : null
  } catch {
    return null
  }
}

async function checkClientData(encoded, type, expect) {
  let data
  try {
    data = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)))
  } catch {
    throw new PasskeyError('clientDataJSON is malformed.')
  }
  if (data.type !== type) throw new PasskeyError(`Expected a ${type} response.`)
  if (data.challenge !== expect.challenge) throw new PasskeyError('The challenge does not match.')
  const origins = [expect.origin].flat()
  if (!origins.includes(data.origin)) throw new PasskeyError(`Unexpected origin ${data.origin}.`)
  if (data.crossOrigin === true) throw new PasskeyError('Cross-origin passkey requests are not allowed.')
  return data
}

async function parseAuthData(bytes, expect) {
  if (bytes.length < 37) throw new PasskeyError('authenticatorData is too short.')
  const rpIdHash = bytes.subarray(0, 32)
  const flags = bytes[32]
  const signCount = new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0)

  const expected = await sha256(expect.rpId)
  if (base64Url(rpIdHash) !== base64Url(expected)) throw new PasskeyError('The passkey is for a different site (rpId).')
  if (!(flags & FLAG_UP)) throw new PasskeyError('The user was not present.')
  if (expect.requireUserVerification && !(flags & FLAG_UV)) throw new PasskeyError('The user was not verified.')

  const out = { flags, signCount, credentialId: null, coseKey: null }
  if (flags & FLAG_AT) {
    let at = 37 + 16 // skip the AAGUID
    if (bytes.length < at + 2) throw new PasskeyError('authenticatorData is truncated.')
    const idLength = (bytes[at] << 8) | bytes[at + 1]
    at += 2
    if (bytes.length < at + idLength) throw new PasskeyError('authenticatorData is truncated.')
    out.credentialId = bytes.slice(at, at + idLength)
    at += idLength
    out.coseKey = decodeCbor(bytes, at).value
  }
  return out
}

/** COSE_Key (RFC 9053) -> JWK. */
function coseToJwk(cose) {
  if (!(cose instanceof Map)) throw new PasskeyError('The public key is malformed.')
  const kty = cose.get(1)
  const alg = cose.get(3)
  if (kty === 2 && alg === ES256 && cose.get(-1) === 1) {
    const x = cose.get(-2)
    const y = cose.get(-3)
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      throw new PasskeyError('The P-256 key is malformed.')
    }
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: base64Url(x), y: base64Url(y) } }
  }
  if (kty === 3 && alg === RS256) {
    const n = cose.get(-1)
    const e = cose.get(-2)
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) throw new PasskeyError('The RSA key is malformed.')
    return { alg, jwk: { kty: 'RSA', n: base64Url(n), e: base64Url(e), alg: 'RS256' } }
  }
  throw new PasskeyError(`Unsupported passkey algorithm (${alg}).`)
}

function importKey(jwk, alg) {
  const algorithm = alg === ES256 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify'])
}

/** ECDSA signatures arrive DER-encoded; Web Crypto wants r || s, 32 bytes each. */
function derToRaw(der) {
  const fail = () => {
    throw new PasskeyError('The signature is malformed.')
  }
  if (der[0] !== 0x30) fail()
  let at = 2
  if (der[1] & 0x80) at = 2 + (der[1] & 0x7f)
  const int = () => {
    if (der[at] !== 0x02) fail()
    const len = der[at + 1]
    let value = der.subarray(at + 2, at + 2 + len)
    at += 2 + len
    while (value.length > 32 && value[0] === 0) value = value.subarray(1)
    if (value.length > 32) fail()
    const out = new Uint8Array(32)
    out.set(value, 32 - value.length)
    return out
  }
  return concat(int(), int())
}
