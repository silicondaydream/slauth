---
title: The account page
description: <slauth-account>, a drop-in settings page for everything slauth does.
---

```html
<script type="module">import 'slauthjs/account'</script>

<slauth-account signed-out="/"></slauth-account>
```

One tag, and people can:

- change their name and email (with a code sent to the new address),
- add and remove passkeys,
- set or change a password, connect and disconnect providers,
- turn two-factor on (with recovery codes) and off,
- see their signed-in devices and sign them out,
- accept or decline organization invitations,
- sign out, or delete their account.

It shows only what you've turned on. It uses the same theme variables as [the sign-in box](/docs/client/sign-in-element/#theming).

| Attribute | |
|---|---|
| `signed-out` | Where to go after signing out or deleting the account. Default `/`. |
| `base-path` | Where the routes live, if you changed `basePath`. Default `/auth`. |

Some of these need a [recent sign-in](/docs/accounts/sessions/#recent-sign-in); the page says so when that's the problem.

Want your own design? Everything it does is in [the client helpers](/docs/client/helpers/).
