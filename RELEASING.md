# Releasing

How slauth gets from `main` to npm, and when. The short version: **GitHub holds the code,
npm holds the package, and a version tag is the only bridge between them.** Nobody
publishes from a laptop; pushing a `v*` tag runs [the Release workflow](.github/workflows/release.yml),
which publishes to npm and makes the GitHub Release.

```
PR merged to main ──► (release day) release PR bumps version + CHANGELOG ──► tag vX.Y.Z
                                                                              │
                     npm: staged slauthjs@X.Y.Z ◄── Release workflow ──► draft GitHub Release
                              │ npm stage approve (2FA)                       │ publish the draft
                              ▼                                               ▼
                     npm: slauthjs@X.Y.Z (with provenance)              GitHub Release
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

## Day to day: merging isn't releasing

- **Merging a PR never publishes anything.** It lands on `main` and waits for the next
  release day. Only a pushed `v*` tag starts a release, and only a maintainer's npm 2FA
  ships it.
- **You can't approve your own PR** on GitHub, so while there's one maintainer the `main`
  ruleset requires 0 approvals: read the diff, wait for green checks, **Squash and merge**.
- **Dependabot:** merge dev-dependency and Actions updates (minor and patch) whenever
  they're green; they never need a release. Look at **major** bumps (TypeScript, Vitest)
  on their own before merging, and close PRs for folders that no longer exist.
- **Docs** live in the private slauth-site repository. Its PR for a feature can merge
  once the library PR has; the live site may then describe it a little before it ships.

## Cutting a minor release (release day)

All with pnpm, from an up-to-date `main`:

1. Branch: `git switch -c prepare-2.1.0` (not `release/…`: that name is for patch lines)
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
   stages the version on npm, then drafts the GitHub Release from the CHANGELOG notes.
8. Ship it on npm, with your 2FA code (or approve it on npmjs.com under the package's
   staged versions):

   ```sh
   npm stage list slauthjs        # shows the stage id
   npm stage approve <stage-id>
   ```

9. Publish the draft GitHub Release (Releases → the draft → Publish release).
10. Check: `pnpm view slauthjs version` shows 2.1.0, and the npm page shows the provenance badge.
11. Add a fresh `## Unreleased` heading to `CHANGELOG.md` with the next feature PR.

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
      repository `slauth`, workflow `release.yml`, environment `npm`. Leave it
      **stage-only** (the default; "Allow npm publish" unticked): CI stages, a person
      approves. A direct `npm publish` from CI then fails with 403 "OIDC permission denied".
      A new entry expires if nothing is staged or published through it within 2 days.
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

**Done once, for the record:** 2.0.0 was published on 2026-11-13 from tag `v2.0.0`
(commit `986f55c`). That commit's workflow still ran a direct `npm publish`, so "Allow npm
publish" was ticked for that one run and unticked afterwards; its GitHub Release was made
by hand, and `0.0.0-stage` was deprecated.

## When something goes wrong

npm answers "not allowed" with a 404 on purpose (so it doesn't reveal which packages
exist), which makes its errors look stranger than they are:

| You see | It means | Fix |
|---|---|---|
| CI: `404 Not Found - PUT https://registry.npmjs.org/slauthjs`, after "Signed provenance statement" | npm didn't accept the run as a trusted publisher, so it used no real credentials | Check the Trusted Publisher: `silicondaydream` / `slauth` / `release.yml` / `npm`, spelled exactly. Then **Re-run failed jobs**; no new tag needed |
| CI: `403 … OIDC permission denied for this action` | The run tried `npm publish`, but the trusted publisher is stage-only | The workflow should run `npm stage publish`. If it's an old tag that doesn't, tick "Allow npm publish" for one re-run, then untick it |
| Your laptop: `404 … is not in this registry` on `npm deprecate`, `npm stage approve` and the like | You're not logged in as a maintainer (`chrisadams.io`), or the saved login is an old token npm no longer accepts | `npm whoami`, then `npm logout` and `npm login` (browser + 2FA), and run it again |
| `pnpm view slauthjs version` still shows the old version right after a release | npm's cache | Wait a minute, or check `https://registry.npmjs.org/slauthjs` directly |
| The Release run stops at "The tag is on main or a release branch" | The tag points at a commit that isn't on `main` or `release/*` | Delete the tag (`git push origin :refs/tags/vX.Y.Z`), tag the merge commit on `main`, push again |
| The Release run stops at "CHANGELOG.md has notes" | No `## X.Y.Z` section | Fix CHANGELOG.md in a PR, then delete and re-push the tag on the new merge commit |

A version number can only ever be published once on npm, even if it's deprecated or
unpublished later. If a staged version turns out wrong, `npm stage reject <id>` and fix
it before approving; if a bad version did ship, release the next patch rather than
reusing the number.
