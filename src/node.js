/**
 * Plain Node (node:http, Express, Connect): turns `auth.handle` into `(req, res, next)`.
 *
 *   import { toNodeHandler } from 'slauthjs/node'
 *   app.use('/auth', toNodeHandler(auth))            // Express
 *   const user = await auth.user(toRequest(req))     // in your own routes
 *
 * Everything else (Workers, Bun, Deno, Next.js, Astro, Hono) speaks Request/Response
 * already and can call auth.handle(request) directly.
 */

/** @param {{ handle(request: Request): Promise<Response> }} auth */
export function toNodeHandler(auth) {
  return async (req, res, next) => {
    try {
      const response = await auth.handle(await toRequest(req))
      res.statusCode = response.status
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === 'set-cookie') continue
        res.setHeader(key, value)
      }
      const cookies = response.headers.getSetCookie?.() ?? []
      if (cookies.length) res.setHeader('Set-Cookie', cookies)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      if (next) next(error)
      else {
        res.statusCode = 500
        res.end()
      }
    }
  }
}

/**
 * A Web Request from a Node IncomingMessage (body included).
 * @param {import('node:http').IncomingMessage & { originalUrl?: string, body?: unknown }} req
 */
export async function toRequest(req) {
  const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] ?? (req.socket?.encrypted ? 'https' : 'http')
  const host = req.headers['x-forwarded-host']?.toString() ?? req.headers.host ?? 'localhost'
  // Under app.use('/auth', ...) Express strips the prefix from req.url; originalUrl keeps it.
  const url = new URL(req.originalUrl ?? req.url ?? '/', `${proto}://${host}`)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of [value].flat()) headers.append(key, v)
  }

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Express's json() may already have read the body.
    if (req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) body = JSON.stringify(req.body)
    else {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 1_000_000) throw new Error('slauth: request body too large.')
        chunks.push(chunk)
      }
      body = Buffer.concat(chunks)
    }
  }
  return new Request(url, { method: req.method, headers, body })
}
