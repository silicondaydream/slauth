// node server.js  →  http://localhost:3000 (codes print in this terminal)
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { slauth } from 'slauthjs'
import { sqlite } from 'slauthjs/stores/sqlite'
import { toNodeHandler, toRequest } from 'slauthjs/node'

const auth = slauth({
  secret: process.env.SLAUTH_SECRET ?? 'dev-only-secret-change-me',
  store: sqlite(new DatabaseSync('auth.db')),
  appName: 'Express example',
})

const app = express()
app.use('/auth', toNodeHandler(auth))

app.get('/api/me', async (req, res) => {
  const user = await auth.user(await toRequest(req))
  if (!user) return res.status(401).json({ error: 'Please sign in.' })
  res.json({ hello: user.email })
})

app.listen(3000, () => console.log('Express example on http://localhost:3000'))
