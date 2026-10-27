import { clientIp } from './util.js'

/** Per-IP limits on the routes that send email or check a guess: [requests, per seconds]. */
export const DEFAULT_LIMITS = {
  'email/start': [10, 600],
  'password/signin': [20, 600],
  'password/signup': [10, 600],
  'two-factor/verify': [20, 600],
}

/**
 * A fixed-window counter per IP and route, kept in the store.
 *
 *   rate:<route>:<ip>:<window>  count
 *
 * Off when no IP can be trusted (see `ip` in the config): the per-email and per-code
 * limits still apply then.
 *
 * @param {import('./index.js').Store} store
 * @param {false | { limits?: Record<string, [number, number]>, ip?: (request: Request) => string | null }} [options]
 */
export function createRateLimit(store, options = {}) {
  if (options === false) return { check: async () => null }
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const ipOf = options.ip ?? clientIp

  return {
    /** Null when it's fine, or how many seconds to wait. */
    async check(route, request) {
      const limit = limits[route]
      const ip = limit && ipOf(request)
      if (!ip) return null
      const [max, seconds] = limit
      const window = Math.floor(Date.now() / 1000 / seconds)
      const key = `rate:${route}:${ip}:${window}`
      const count = ((await store.get(key)) ?? 0) + 1
      await store.put(key, count, { ttl: seconds })
      return count > max ? (window + 1) * seconds - Math.floor(Date.now() / 1000) : null
    },
  }
}
