# Releasing

How slauth gets from `main` to npm, and when. The short version: **GitHub holds the code,
npm holds the package, and a version tag is the only bridge between them.** Nobody
publishes from a laptop; pushing a `v*` tag runs [the Release workflow](.github/workflows/release.yml),
which publishes to npm and makes the GitHub Release.

```
PR merged to main ──► (release day) release PR bumps version + CHANGELOG ──► tag vX.Y.Z
                                                                              │
                     npm: slauthjs@X.Y.Z (with provenance) ◄── Release workflow ──► GitHub Release
```

## The schedule

| Kind | When | What's in it |
|---|---|---|
| **Minor** (2.1.0) | **The first Tuesday of each month**, if `## Unreleased` has anything | Everything merged by the freeze |
| **Freeze** | The Thursday before | Feature PRs merged by then make it; later ones wait a month |
| **Release candidate** (2.1.0-rc.1) | Optional, at the freeze | Goes to npm's `next` tag, for anyone who wants to try it |
| **Patch** (2.1.1) | Only when needed (see below) | A fix, nothing else |
| **Major** (3.0.0) | Rarely, announced at least one minor ahead | Breaking changes, with an "Upgrading" section and deprecations shipped first |

A patch goes out **off schedule only** for:

1. **A security fix**: as soon as it's ready, through a GitHub security advisory
   (see [SECURITY.md](SECURITY.md)), on every supported line.
2. **A regression** in the latest release that breaks sign-in, or loses or leaks data.
3. **A shipped dependency that needs updating.** slauth has no runtime dependencies, so
   this is close to never: Dependabot's dev-dependency and Actions updates change nothing
   in the package and **never need a release**. They merge any time and ride along with the
   next minor.

Everything else, including ordinary bug fixes, waits for the next minor. Because new
features are off by default (CODE_POLICY §1), unreleased code on `main` never changes
anything for anyone until they upgrade and turn it on.

## Cutting a minor release (release day)

All with pnpm, from an up-to-date `main`:

1. Branch: `git switch -c release/2.1.0`
2. Bump without tagging: `pnpm version minor --no-git-tag-version`
3. In `CHANGELOG.md`, rename `## Unreleased` to `## 2.1.0`, and read it through as a user would.
4. `pnpm release:check` (tests, types, the smoke test, the package contents and the notes).
5. Open a PR titled **Release 2.1.0**, get it green, merge it.
6. Tag the merge commit on `main` and push the tag:

   ```sh
   git switch main && git pull
   git tag v2.1.0 && git push origin v2.1.0
   ```

7. Approve the `npm` environment when GitHub asks (Actions → the Release run). It
   publishes, then creates the GitHub Release from the CHANGELOG notes.
8. Check: `pnpm view slauthjs version` shows 2.1.0, and the npm page shows the provenance badge.
9. Add a fresh `## Unreleased` heading to `CHANGELOG.md` with the next feature PR.

For a release candidate, the same with `pnpm version preminor --preid rc --no-git-tag-version`
(gives `2.1.0-rc.0`) and tag `v2.1.0-rc.0`; it lands on npm's `next` tag, not `latest`.

## A patch for an older line

When `main` already has unreleased features, fix the released line on a branch made from
its tag, so the patch carries only the fix:

```sh
git switch -c release/2.1.x v2.1.0
# cherry-pick or write the fix (with its test), bump with pnpm version patch --no-git-tag-version,
# add a "## 2.1.1" section to CHANGELOG.md, open a PR into release/2.1.x, merge it, then:
git tag v2.1.1 && git push origin v2.1.1
```

Then bring the fix and the CHANGELOG entry back to `main` with a normal PR. The Release
workflow only publishes tags that are on `main` or a `release/*` branch.

## One-time setup

These are settings, not code, so they live here as a checklist.

**npm** (npmjs.com, signed in as the package owner):

- [ ] Two-factor auth on the account (Account → Two-Factor Authentication, "Authorization and publishing").
- [ ] slauthjs → Settings → **Trusted Publisher** → GitHub Actions: owner `silicondaydream`,
      repository `slauth`, workflow `release.yml`, environment `npm`.
- [ ] slauthjs → Settings → **Publishing access**: "Require two-factor authentication and disallow tokens".
- [ ] Account → Access Tokens: delete any old publish tokens.

**GitHub** (silicondaydream/slauth → Settings):

- [ ] General → Pull Requests: allow **squash merging** only, "Automatically delete head
      branches" on, "Always suggest updating pull request branches" on.
- [ ] Rules → Rulesets → **New branch ruleset** "main": target the default branch;
      restrict deletions; block force pushes; require a pull request before merging
      (required approvals 0 while there's one maintainer, "Require review from Code Owners"
      once there are two); require status checks to pass: *Library (Node 22)*, *Library
      (Node 24)*, *Library (Node 20 smoke test)*, *Workflow security (zizmor)*, and once
      the repository is public, *Analyze JavaScript* and *Dependency review*.
- [ ] Rules → Rulesets → **New tag ruleset** "releases": target `v*`; restrict creations,
      updates and deletions, with yourself (Repository admin) on the bypass list. Then only
      maintainers can start a release.
- [ ] Environments → **New environment** `npm`: required reviewer yourself; deployment
      branches and tags → selected → add the tag rule `v*`.
- [ ] Security: private vulnerability reporting, Dependabot alerts and security updates on;
      secret scanning and push protection on (free once public).

**First release of 2.x:** 2.0.0 was never published. Tag the commit that's exactly 2.0.0
(after the site moved out, before the 2.1 work) and push it; the Release workflow does the rest:

```sh
git tag v2.0.0 986f55c && git push origin v2.0.0
```

That commit has the older release workflow, so create the 2.0.0 GitHub Release by hand
(Releases → Draft a new release → tag v2.0.0 → paste the 2.0.0 CHANGELOG section).
From 2.1.0 on, the workflow does it.

Also: `npm deprecate slauthjs@0.0.0-stage "Not a real release; use slauthjs@latest."`
