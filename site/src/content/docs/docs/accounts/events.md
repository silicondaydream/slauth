---
title: Events and custom emails
description: Run your own code when people sign up and sign in, and word the emails your way.
---

## Events

```js
slauth({
  ...,
  on: {
    signUp: async ({ user, method }) => {
      await env.DB.prepare('INSERT INTO profiles (user_id) VALUES (?)').bind(user.id).run()
    },
    signIn: ({ user, method, request }) => console.log(user.email, 'signed in with', method),
    signOut: ({ user }) => {},
    userUpdated: ({ user }) => {},
    userDeleted: async ({ user }) => {
      await env.DB.prepare('DELETE FROM notes WHERE user_id = ?').bind(user.id).run()
    },
  },
})
```

Handlers are awaited, so the sign-in answer waits for them. A handler that throws is logged and doesn't stop the sign-in. `method` is `email`, `link`, `password`, `passkey`, `oauth:<provider>` or `admin`.

To decide *who* may sign in, use [`allow`](/docs/configuration/#allow), not an event: it's checked before anything happens, and gets the method, provider and profile.

## Your own emails

```js
slauth({
  ...,
  emails: (kind, { code, link, appName, minutes, orgName, inviter }) => {
    if (kind === 'sign-in') return { subject: `Your code: ${code}`, text: `…`, html: `…` }
    return null // keep slauth's wording for the rest
  },
})
```

`kind` is `sign-in`, `email-change` or `invite`. The [sender](/docs/email/) gets the result, plus `kind`, `code` and `link`, if you'd rather build the email there (for example with your provider's templates).
