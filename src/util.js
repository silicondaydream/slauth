/** Small helpers shared across slauth. Web Crypto only, so they run anywhere. */

export function readCookie(header, name) {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

export function base64Url(buffer) {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Compares without stopping at the first difference, so timing gives nothing away. */
export function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function fromBase64Url(text) {
  const base64 = String(text).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

const encoder = new TextEncoder()

export async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? encoder.encode(data) : data))
}

export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return base64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

/** A Set-Cookie value. maxAge null makes a browser-session cookie; 0 deletes it. */
export function serializeCookie(name, value, { maxAge = null, secure = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, 'HttpOnly', `SameSite=${sameSite}`]
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`)
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A random, URL-safe id with a readable prefix, e.g. id('usr') → "usr_k3J…". */
export function randomId(prefix, bytes = 15) {
  return `${prefix}_${base64Url(crypto.getRandomValues(new Uint8Array(bytes)))}`
}

/** A 302 to `location`, with any Set-Cookie values. */
export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

/**
 * Only paths on this site ("/dashboard?tab=1"), never "//evil.example" or
 * "https://evil.example", so a sign-in link can't send someone elsewhere.
 */
export function safeRedirect(path, fallback = '/') {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\') || /[\r\n]/.test(path)) return fallback
  return path
}

/** Adds query parameters to a same-site path. */
export function withParams(path, params) {
  const url = new URL(path, 'http://x')
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, value)
  return url.pathname + url.search + url.hash
}

/** The visitor's IP from the headers hosts set for it, or null when there's none we can trust. */
export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('fly-client-ip') ?? request.headers.get('x-real-ip') ?? null
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
