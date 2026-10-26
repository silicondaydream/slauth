---
title: Magic links
description: A one-tap sign-in link in the code email.
---

```js
slauth({ ..., magicLinks: true })
```

The sign-in email then has a button as well as the code. Either works, once: using one spends the other.

The link opens a small page on your site with a **Continue** button, and signing in happens when it's pressed. That's on purpose: email security scanners (Outlook's especially) open every link to check it, and a link that signed in on the first visit would be used up before the person saw it.

Where they end up: pass a `redirect` when asking for the code.

```js
await auth.email.start('me@example.com', { redirect: '/dashboard' })
```

The link works in any browser, so opening it on a phone signs the phone in, even if the code was asked for on a laptop. It lives for the same 10 minutes as the code.

The link points at `baseUrl` (or the address the request came in on). Behind a proxy, set [`baseUrl`](/docs/configuration/#baseurl).
