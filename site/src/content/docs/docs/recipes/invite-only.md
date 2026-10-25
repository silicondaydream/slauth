---
title: Invite-only apps
description: Let in only the people you choose.
---

The simplest version is a list:

```js
slauth({
  // ...
  allow: ['me@example.com', 'partner@example.com', '@family.com'],
})
```

An entry starting with `@` lets in everyone at that domain. People not on the list get `not-allowed` when they ask for a code.

## A list you can change without deploying

Keep invites in your own table and check it:

```js
slauth({
  // ...
  allow: async (email) =>
    Boolean(await env.DB.prepare('SELECT 1 FROM invites WHERE email = ?').bind(email).first()),
})
```

slauth checks `allow` when a code is asked for, when it's used, on passkey sign-ins and **on every request**, so deleting someone's invite signs them out everywhere. Keep the check fast (an indexed lookup is fine).

## With Cloudflare Access

If you already use [Cloudflare Access](/docs/sign-in/cloudflare-access/), its policy *is* your invite list, and you can leave `allow` out.
