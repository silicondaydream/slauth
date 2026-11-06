import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { d1 } from './d1.js'
import { kv } from './kv.js'
import { memory } from './memory.js'
import { sqlite } from './sqlite.js'

afterEach(() => vi.useRealTimers())

/** A pretend D1 binding over node:sqlite, with D1's prepare/bind/first/run shape. */
function fakeD1() {
  const db = new DatabaseSync(':memory:')
  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      let params = []
      const api = {
        bind: (...args) => ((params = args), api),
        first: async () => stmt.get(...params) ?? null,
        run: async () => stmt.run(...params),
        all: async () => ({ results: stmt.all(...params) }),
      }
      return api
    },
  }
}

/** A pretend Workers KV namespace. */
function fakeKv() {
  const rows = new Map()
  return {
    rows,
    get: async (key, type) => {
      const row = rows.get(key)
      if (!row || (row.expires && row.expires <= Date.now())) return null
      return type === 'json' ? JSON.parse(row.value) : row.value
    },
    put: async (key, value, opts) => void rows.set(key, { value, expires: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null }),
    delete: async (key) => void rows.delete(key),
    // Like KV: sorted keys, pages, and a cursor until list_complete.
    list: async ({ prefix, limit, cursor }) => {
      const keys = [...rows.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const page = keys.slice(start, start + limit)
      return { keys: page.map((name) => ({ name })), list_complete: start + limit >= keys.length, cursor: String(start + limit) }
    },
  }
}

const stores = {
  memory: () => memory(),
  d1: () => d1(fakeD1()),
  kv: () => kv(fakeKv()),
  sqlite: () => sqlite(new DatabaseSync(':memory:')),
}

for (const [name, make] of Object.entries(stores)) {
  describe(`${name} store`, () => {
    it('gets, puts and deletes JSON', async () => {
      const store = make()
      expect(await store.get('a')).toBeNull()
      await store.put('a', { n: 1, list: ['x'] })
      expect(await store.get('a')).toEqual({ n: 1, list: ['x'] })
      await store.put('a', 'replaced')
      expect(await store.get('a')).toBe('replaced')
      await store.delete('a')
      expect(await store.get('a')).toBeNull()
    })

    it('forgets things after their ttl', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const store = make()
      await store.put('short', 1, { ttl: 60 })
      await store.put('forever', 2)
      vi.setSystemTime(Date.now() + 61_000)
      expect(await store.get('short')).toBeNull()
      expect(await store.get('forever')).toBe(2)
    })

    it('lists by prefix, a page at a time', async () => {
      const store = make()
      for (const key of ['user:c', 'user:a', 'user:b', 'email:a', 'userx']) await store.put(key, key)
      await store.put('user:gone', 1, { ttl: 60 })
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.now() + 61_000)
      const first = await store.list('user:', { limit: 2 })
      expect(first.items).toEqual([{ key: 'user:a', value: 'user:a' }, { key: 'user:b', value: 'user:b' }])
      expect(first.cursor).toBeTruthy()
      const second = await store.list('user:', { limit: 2, cursor: first.cursor })
      expect(second.items.map((i) => i.key)).toEqual(['user:c'])
      expect(second.cursor).toBeNull()
    })
  })
}

describe('store details', () => {
  it('kv never asks for a ttl under 60 seconds (KV refuses those)', async () => {
    const ns = fakeKv()
    await kv(ns).put('x', 1, { ttl: 5 })
    expect(ns.rows.get('slauth:x').expires - Date.now()).toBeGreaterThan(59_000)
  })

  it('refuses odd table names', () => {
    expect(() => d1(fakeD1(), { table: 'x; DROP TABLE y' })).toThrow()
    expect(() => sqlite(new DatabaseSync(':memory:'), { table: 'bad name' })).toThrow()
  })

  it('memory hands out copies, not its own objects', async () => {
    const store = memory()
    const value = { n: 1 }
    await store.put('a', value)
    value.n = 2
    expect(await store.get('a')).toEqual({ n: 1 })
  })
})
