---
title: The sign-in box
description: <slauth-sign-in>, a drop-in web component for any framework.
---

```html
<script type="module">import 'slauth/element'</script>

<slauth-sign-in app-name="My App" redirect="/"></slauth-sign-in>
```

It does the whole flow: email → code → signed in, with "Sign in with a passkey" on the first screen and an offer to add a passkey after an email sign-in. It's a plain custom element, so it works in React, Vue, Svelte, Astro or no framework at all.

## Attributes

| Attribute | |
|---|---|
| `app-name` | Shown in the heading ("Sign in to My App"). |
| `redirect` | Where to go once signed in. Leave it out to handle it yourself. |
| `base-path` | Where the routes live, if you changed `basePath`. Default `/auth`. |
| `no-passkeys` | Email codes only. |

## Events

```js
document.querySelector('slauth-sign-in').addEventListener('slauth:signed-in', (event) => {
  console.log('Welcome', event.detail.user.email)
})
```

## Theming

Five CSS variables, plus `::part(card)` for anything else:

```css
slauth-sign-in {
  --slauth-accent: #6366f1; /* buttons and focus ring */
  --slauth-ink: #111827;    /* text and borders */
  --slauth-bg: #ffffff;     /* the card */
  --slauth-radius: 10px;
  --slauth-font: inherit;
}
slauth-sign-in::part(card) {
  box-shadow: none;
}
```

## Without a bundler

The element is two plain files, `element.js` and `client.js`. Serve them from your static folder and import `/slauth/element.js`. [`examples/workers-d1`](https://github.com/silicondaydream/slauth/tree/main/examples/workers-d1) does exactly this.
