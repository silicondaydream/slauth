import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toNodeHandler } from './node.js'
import { setup } from '../test/helpers.js'

let server
let base
const ctx = setup()

beforeAll(async () => {
  const handler = toNodeHandler(ctx.auth)
  server = createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, resolve))
  base = `http://localhost:${server.address().port}`
})
afterAll(() => server.close())

describe('Node adapter', () => {
  it('runs the whole email sign-in over plain node:http', async () => {
    const post = (path, body, cookie = '') =>
      fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie }, body: JSON.stringify(body) })
    expect((await post('/auth/email/start', { email: 'me@example.com' })).status).toBe(200)
    const verified = await post('/auth/email/verify', { email: 'me@example.com', code: ctx.mailbox[0].code })
    expect(verified.status).toBe(200)
    const cookie = verified.headers.getSetCookie()[0].split(';')[0]
    const session = await (await fetch(`${base}/auth/session`, { headers: { cookie } })).json()
    expect(session.user.email).toBe('me@example.com')
  })
})
