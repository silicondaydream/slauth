---
title: Storage keys
description: Everything slauth writes to your store.
---

| Key | Value | Lives |
|---|---|---|
| `user:<id>` | `{ id, email, name, image, roles, metadata, privateMetadata, createdAt, updatedAt, bannedAt }` | forever |
| `email:<email>` | the user's id | forever |
| `session:<sha256 of token>` | `{ userId, createdAt, refreshedAt, method, userAgent, ip, impersonatorId }` | 30 days, renewed |
| `sessions:<user id>` | list of their session ids | forever |
| `code:<email>` | `{ email, hash, expiresAt, tries, sentAt, linkId? }` | 10 minutes |
| `code-change:<user id>` | the same, for a new email address | 10 minutes |
| `link:<sha256 of token>` | `{ email, redirect }` (magic links) | 10 minutes |
| `signup:<email>` | `{ hash }`: a password waiting for its email to be proved | 10 minutes |
| `challenge:<challenge>` | `{ type, userId? }` | 5 minutes |
| `passkey:<credential id>` | `{ id, userId, publicKey, alg, counter, name, createdAt, lastUsedAt, transports }` | forever |
| `passkeys:<user id>` | list of credential ids | forever |
| `oauth:<state>` | `{ provider, verifier, redirect, returnTo, linkUserId }` | 10 minutes |
| `account:<provider>:<account id>` | `{ provider, accountId, userId, email, name, createdAt, updatedAt, tokens? }` | forever |
| `accounts:<user id>` | list of `<provider>:<account id>` | forever |
| `password:<user id>` | `{ hash: "pbkdf2-sha256$…", updatedAt }` | forever |
| `pwfail:<email>` | `{ count }` | 15 minutes |
| `totp:<user id>` | `{ secret, enabledAt, lastStep, recovery: [sha256…] }` | forever |
| `2fa:<sha256 of token>` | `{ userId, method, tries }`: a sign-in waiting for its code | 10 minutes |
| `jwk:current`, `jwk:previous` | the signing key's id, and the two before it | forever |
| `jwk:<kid>` | `{ kid, publicJwk, privateJwk (encrypted), createdAt }` | forever |
| `org:<org id>` | `{ id, name, metadata, createdAt, createdBy }` | forever |
| `members:<org id>` | `[{ userId, role, joinedAt }]` | forever |
| `orgs:<user id>` | list of org ids | forever |
| `invite:<invite id>` | `{ id, orgId, email, role, invitedBy, createdAt, expiresAt }` | 7 days |
| `invites:<email>`, `org-invites:<org id>` | lists of invite ids | forever |
| `rate:<route>:<ip>:<window>` | a count | the window |
| `lock:<user id>` | the PIN lock: `{ pinHash, salt, sessionKey, failures, lockedUntil, policy }` | forever |

Ids look like `usr_`, `org_` or `inv_` followed by 20 random characters. Users from slauth 1 (`{ id, email, createdAt }`) are read with the new fields filled in with defaults.

## Deleting someone

```js
await auth.users.delete(id)
```

removes all of the above that belongs to them. See [Users](/docs/accounts/users/#deleting).
