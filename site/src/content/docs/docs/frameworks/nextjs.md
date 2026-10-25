---
title: Next.js
description: slauth in the Next.js App Router, with route handlers and server components.
---

```ts title="lib/auth.ts"
import { slauth } from 'slauth'
import { sqlite } from 'slauth/stores/sqlite'
import Database from 'better-sqlite3'
import { headers } from 'next/headers'

export const auth = slauth({
  secret: process.env.SLAUTH_SECRET!,
  store: sqlite(new Database('app.db')),
  appName: 'My Next App',
})

/** The signed-in person in a server component or server action. */
export async function currentUser() {
  return auth.user(new Request('http://local', { headers: await headers() }))
}
```

```ts title="app/auth/[...slauth]/route.ts"
import { auth } from '@/lib/auth'

const handler = (request: Request) => auth.handle(request)
export { handler as GET, handler as POST }
```

```tsx title="app/dashboard/page.tsx"
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'

export default async function Dashboard() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')
  return <h1>Hi {user.email}</h1>
}
```

```tsx title="app/sign-in/page.tsx"
'use client'
import { useEffect } from 'react'

export default function SignIn() {
  useEffect(() => void import('slauth/element'), [])
  return <slauth-sign-in app-name="My Next App" redirect="/dashboard" />
}
```

:::note
SQLite needs the Node.js runtime and a disk that persists. On serverless hosts without one, use a hosted database (write a [10-line store](/docs/stores/#write-your-own) for it), or Cloudflare D1 from a Worker.
:::

For TypeScript, declare the element once:

```ts title="types/slauth.d.ts"
declare namespace JSX {
  interface IntrinsicElements {
    'slauth-sign-in': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      'app-name'?: string; redirect?: string; 'base-path'?: string; 'no-passkeys'?: boolean
    }
  }
}
```
