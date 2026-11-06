# Security policy

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately with
[GitHub's private vulnerability reporting](https://github.com/silicondaydream/slauth/security/advisories/new)
and include:

- what's affected (version, config, runtime),
- how to reproduce it, ideally as a failing test against `auth.handle()`,
- what an attacker gains.

You'll get an answer within **3 working days**, and a fix or a plan within **14 days** for
anything serious. We'll credit you in the advisory unless you'd rather not be named.

## Supported versions

| Version | Supported |
|---|---|
| 2.x | ✅ security fixes |
| 1.x | ⚠️ critical fixes until 2027-05-01 |
| < 1.0 | ❌ |

## Scope

In scope: everything under `src/` (the library, the client and the elements), and the
release pipeline.

Out of scope: the example apps (they're starting points, not products), the marketing
site, and issues that need a compromised `secret` or database, unless slauth makes the
damage worse than it has to be.

## What slauth does about security

See [Security](https://slauth.dev/docs/concepts/security/) in the docs, and the rules in
[CODE_POLICY.md](CODE_POLICY.md#3-security-rules).
