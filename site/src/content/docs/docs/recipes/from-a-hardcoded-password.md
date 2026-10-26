---
title: From a hard-coded password
description: Replace "one password in an env var" with real accounts.
---

The classic side-project lock:

```js
if (request.headers.get('cookie') !== `pw=${env.PASSWORD}`) return new Response('Nope', { status: 401 })
```

It works until a second person needs in, or the password ends up in a screenshot. To move to slauth:

1. **Install slauth** and mount it (see the [quickstart](/docs/quickstart/)).
2. **Replace the check** with `requireUser`:

   ```js
   const user = await auth.requireUser(request)
   if (user instanceof Response) return user
   ```

3. **Let in the same people** with an [allow list](/docs/recipes/invite-only/):

   ```js
   allow: ['me@example.com']
   ```

4. **Move your data to the person.** If everything was "the one user's", attach it to your new `user.id` the first time you sign in:

   ```js
   if (user.email === env.OWNER_EMAIL) await adoptOldData(user.id)
   ```

   Copy rather than move, so the old version of your app still works if you need to roll back.

5. **Delete `PASSWORD`** from your environment once you've signed in.
