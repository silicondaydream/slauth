# slauth on Cloudflare Workers + D1

```sh
npm install
cp .dev.vars.example .dev.vars
npm run dev          # http://localhost:8787 — codes print in this terminal
```

Deploy:

```sh
npx wrangler secret put SLAUTH_SECRET
npm run deploy
```
