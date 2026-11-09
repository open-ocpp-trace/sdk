# Releasing the TypeScript packages

The packages of this workspace (`@open-ocpp-trace/core`,
`@open-ocpp-trace/jsonl`) are released together, at one shared version, by
the manually started workflow
[`.github/workflows/release-typescript.yml`](../.github/workflows/release-typescript.yml).
It is never triggered by a push or a tag.

## Registry

The packages are published to the npm registry of
[GitHub Packages](https://github.com/orgs/open-ocpp-trace/packages),
`https://npm.pkg.github.com`, not to npmjs.com. Installing from it needs a
GitHub token with `read:packages`, even for a public package; the package
READMEs show the consumer configuration.

npmjs.com may be added later. It would start at the next version: the tag
of a version released on GitHub Packages already exists,
and the workflow refuses to release a tagged version again.

## Versioning

- The packages are released in lockstep: one
  [Semantic Versioning](https://semver.org/) version, set in the
  `package.json` of every package, and every release publishes all of
  them. `jsonl` depends on the exact version of `core` (`workspace:*` is
  replaced at pack time), so a separate release of `core` would leave
  `jsonl` on the previous one; a shared version keeps the pair
  consistent and tells users which versions go together.
- The version follows the largest change of any package: a breaking
  change in `core` is a major release of both. A package without change
  is released at the new version anyway, with the changelog entry shown
  under [Changelog](#changelog).
- The workflow refuses a release whose packages are at different
  versions, or whose `jsonl` does not pin `core` to that version
  (`scripts/release-manifest.ts lockstep`).
- The version is independent of the format version
  (`schemaVersion`, owned by the
  [specification](https://github.com/open-ocpp-trace/specification)); see
  [docs/architecture.md](../docs/architecture.md#versioning). A breaking API
  change is a major release even when the format does not change;
  supporting a new backward-compatible format minor is a minor release.
- Each package README lists its supported format versions under
  « Supported format versions »; update it with any change of support.

## Changelog

Each package has a `CHANGELOG.md` following
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/):

- an `## [Unreleased]` section at the top, filled in by the pull requests
  that change what package users see;
- the release pull request moves those entries under a new
  `## [x.y.z] - YYYY-MM-DD` heading, latest first, and leaves `Unreleased`
  empty;
- changes grouped under `### Added`, `### Changed`, `### Deprecated`,
  `### Removed`, `### Fixed`, `### Security`, with breaking changes
  marked **Breaking:** and listed first in their group;
- reference links at the bottom: `[unreleased]` compares the latest tag
  with `HEAD`, and each `[x.y.z]` points to its tag. From 0.2.0 on, that
  is the shared tag `typescript-v<version>`; the `[0.1.0]` links keep
  pointing to the per-package tags of that release (see [Tags](#tags)).

Every release has a section in both changelogs, even for a package that
did not change; the workflow refuses a real release when either lacks
`## [<version>]`. Such a section says only that the package follows the
new version of its dependency, for example in `jsonl`:

```markdown
## [0.2.0] - YYYY-MM-DD

### Changed

- Updated `@open-ocpp-trace/core` to 0.2.0.
```

For `core`, which depends on no other package, write
« No change; released with `@open-ocpp-trace/jsonl` 0.2.0. » under
`### Changed`.

## Tags

A release creates one lightweight tag, `typescript-v<version>`, for
example `typescript-v0.2.0`, on the commit the workflow ran on, then the
GitHub release of that tag, titled `TypeScript <version>`, whose notes are
the `## [<version>]` section of each package changelog
(`scripts/release-notes.sh`). The workflow creates both after a successful
publish; do not create them by hand.

0.1.0 was released one package at a time, before the lockstep: its tags
are `@open-ocpp-trace/core@0.1.0` and `@open-ocpp-trace/jsonl@0.1.0`, each
with its own GitHub release. They stay as history.

## Prerequisites (once)

These need admin rights on the GitHub organization and repository.
Prerequisites 1 and 2 are done; do not run the workflow, not even a dry
run, while the environment is missing or unprotected: the first run that
names a missing environment creates it unprotected.

1. **GitHub environment `github-packages`** (repository Settings →
   Environments), before any run: required reviewers (the maintainers)
   and deployment branches restricted to `main`. The publish job of every
   run, dry runs included, waits for a reviewer and, with that branch
   rule, runs only from `main`; on another branch only the `verify` job
   proves the package. Enable « Prevent self-review » only when at least
   two people are required reviewers, otherwise the person who starts a
   run can never approve it.

   The publish job gets `packages: write`. The in-workflow check that
   refuses another branch than `main` lives in the workflow file itself,
   so a modified copy on a branch can drop it; only the environment rule
   stops such a run.

2. **Package creation** (organization Settings → Packages): allow members
   to create public packages, so the packages can be made public.
3. **After the first publish of each package**, on its page under
   [the organization's packages](https://github.com/orgs/open-ocpp-trace/packages):
   - check that it is linked to `open-ocpp-trace/sdk` (the `repository`
     field of its `package.json`);
   - Package settings → « Danger Zone » → « Change visibility » →
     public. A new package starts private. Making it public cannot be
     undone.

## What the workflow verifies

The `verify` job, on the commit the workflow is started on:

1. fetches the pinned conformance corpus (`conformance/fetch.sh`);
2. `bun install --frozen-lockfile`, `vp check`, `vp test`;
3. the clean-consumer smoke test (`scripts/smoke-consumer.sh`): builds,
   packs and verifies both packages, installs the tarballs with npm in a
   project outside the workspace, imports every entry point under Node.js
   and Bun and type-checks a TypeScript consumer;
4. packs both packages with `scripts/pack-release.sh` and checks the
   tarballs with `scripts/verify-packages.sh`: only `package.json`,
   `README.md`, `LICENSE` and `dist/` are packed, every `exports` target
   exists, the development-only `@open-ocpp-trace/source` condition and
   `workspace:` dependencies are gone, `publint --strict` and
   `attw --profile esm-only` pass (see the [README](README.md#packed-packages));
5. checks the lockstep with `scripts/release-manifest.ts lockstep`: both
   tarballs carry the same version, and the packed `jsonl` depends on
   exactly that version of `core`;
6. extracts the release notes with `scripts/release-notes.sh` and shows
   them in the run summary; a real release fails when either changelog
   has no `## [<version>]` section with entries, a dry run only warns;
7. checks that the tag `typescript-v<version>` and both
   `<package>@<version>` do not exist yet and, for a real release, that the
   version is not `0.0.0`.

The `publish` job publishes **those** tarballs, uploaded as an artifact; it
does not rebuild. It publishes `core` first, then `jsonl`, which depends on
it.

## Permissions

- The workflow token is read-only (`contents: read`) by default.
- `verify` gets `packages: read`, to query the registry.
- Only `publish` gets `packages: write`; it runs in the `github-packages`
  environment and authenticates with the workflow token. No registry
  token is stored in the repository.
- Only `tag` gets `contents: write`, to create the tag through the Git
  references API and the GitHub release. It runs after `publish` and only
  when not a dry run.

## Release the packages

1. Open a pull request that sets the same `version` in
   `typescript/packages/core/package.json` and
   `typescript/packages/jsonl/package.json`, and moves the `Unreleased`
   entries of both `CHANGELOG.md` under the new version heading, with the
   entry of [Changelog](#changelog) for a package without change (and
   updates the READMEs if the supported format versions change). Merge it
   into `main`.
2. Actions → « Release TypeScript packages » → « Run workflow » on `main`,
   keep **dry-run** ticked. Approve the `github-packages` environment when
   asked. The run summary shows the release notes; the publish step runs
   `npm publish --dry-run` on both tarballs and prints their contents,
   names, versions and tags. No tag or release is created.
3. Run it again with **dry-run** unticked and approve. The workflow
   publishes `core` then `jsonl` with `npm publish ./release/<tarball>
   --registry https://npm.pkg.github.com` (npm 11.21.1, Node.js 24), then
   creates the tag `typescript-v<version>` and its GitHub release. It
   passes no `--provenance`: GitHub Packages does not document npm
   provenance.
4. Check both package pages on GitHub: version, linked repository and
   visibility (see prerequisite 3), and the GitHub release. Then, with a
   token that has `read:packages`:

   ```sh
   npm view @open-ocpp-trace/jsonl@<version> dependencies --registry=https://npm.pkg.github.com
   ```

   It must show `core` at the same version.

A real publish is refused from any branch other than `main`.

## When a run fails after publishing

Use « Re-run failed jobs » on that run, never « Re-run all jobs » and never
a new run: once a version is published, a new `verify` refuses it. A re-run
reuses the verified tarballs and release notes of the run, so it works only
while its artifacts exist (7 days).

The re-run is safe at every step:

- `publish` checks each package before publishing it and skips, with a
  notice, a version already on the registry. A run that published `core`
  and failed on `jsonl` publishes only `jsonl` when re-run.
- `tag` skips the tag when it already points at the commit of the run, and
  fails when it points at another commit. It then skips the GitHub release
  when the release of that tag already exists.

## Dry run

A dry run (the default) runs the whole `verify` job and
`npm publish --dry-run` on both verified tarballs, then stops: nothing is
sent to the registry and no tag or release is created. It still needs the
`github-packages` environment approval.

To check the tarballs and the release notes locally instead, from
`typescript/`:

```sh
vp run -r pack
sh scripts/pack-release.sh /tmp/open-ocpp-trace-release core jsonl
sh scripts/verify-packages.sh /tmp/open-ocpp-trace-release/*.tgz
node scripts/release-manifest.ts lockstep /tmp/open-ocpp-trace-release/*.tgz
sh scripts/release-notes.sh <version>
npm publish /tmp/open-ocpp-trace-release/open-ocpp-trace-core-<version>.tgz --registry https://npm.pkg.github.com --dry-run
```
