# Releasing the TypeScript packages

Each package of this workspace (`@open-ocpp-trace/core`,
`@open-ocpp-trace/jsonl`) is released on its own by the manually started
workflow
[`.github/workflows/release-typescript.yml`](../.github/workflows/release-typescript.yml).
It is never triggered by a push or a tag.

## Registry

The packages are published to the npm registry of
[GitHub Packages](https://github.com/orgs/open-ocpp-trace/packages),
`https://npm.pkg.github.com`, not to npmjs.com. Installing from it needs a
GitHub token with `read:packages`, even for a public package; the package
READMEs show the consumer configuration.

npmjs.com may be added later. It would start at the next version of each
package: the tag of a version released on GitHub Packages already exists,
and the workflow refuses to release a tagged version again.

## Versioning

- Each package has its own [Semantic Versioning](https://semver.org/)
  version, in its `package.json`. Releasing one package does not release
  the other.
- The package version is independent of the format version
  (`schemaVersion`, owned by the
  [specification](https://github.com/open-ocpp-trace/specification)); see
  [docs/architecture.md](../docs/architecture.md#versioning). A breaking API
  change is a major release even when the format does not change;
  supporting a new backward-compatible format minor is a minor release.
- Each package README lists its supported format versions under
  « Supported format versions »; update it with any change of support.
- `jsonl` depends on the exact version of `core` found in the workspace
  (`workspace:*` is replaced at pack time). When both change, release
  `core` first: the workflow refuses to publish `jsonl` while the `core`
  version it depends on is not on the registry.

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
  with `HEAD`, and each `[x.y.z]` points to its tag.

## Tags

A release creates the lightweight tag `<package name>@<version>`, for
example `@open-ocpp-trace/core@0.1.0`, on the commit the workflow ran on.
The workflow creates it after a successful publish; do not create it by
hand.

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
4. packs the selected package with `scripts/pack-release.sh` and checks
   the tarball with `scripts/verify-packages.sh`: only `package.json`,
   `README.md`, `LICENSE` and `dist/` are packed, every `exports` target
   exists, the development-only `@open-ocpp-trace/source` condition and
   `workspace:` dependencies are gone, `publint --strict` and
   `attw --profile esm-only` pass (see the [README](README.md#packed-packages));
5. checks that the tag and the version do not exist yet on GitHub
   Packages and, for a real release, that the version is not `0.0.0` and
   that the `@open-ocpp-trace/*` dependencies of the tarball are
   published.

The `publish` job publishes **that** tarball, uploaded as an artifact; it
does not rebuild.

## Permissions

- The workflow token is read-only (`contents: read`) by default.
- `verify` gets `packages: read`, to query the registry.
- Only `publish` gets `packages: write`; it runs in the `github-packages`
  environment and authenticates with the workflow token. No registry
  token is stored in the repository.
- Only `tag` gets `contents: write`, to create the tag through the Git
  references API. It runs after `publish` and only when not a dry run.

## Release a package

1. Open a pull request that sets `version` in
   `typescript/packages/<package>/package.json` and moves the `Unreleased`
   entries of its `CHANGELOG.md` under the new version heading (and the README if the supported format versions
   change). Merge it into `main`.
2. Actions → « Release TypeScript package » → « Run workflow » on `main`,
   choose the package, keep **dry-run** ticked. Approve the
   `github-packages` environment when asked. The publish step runs
   `npm publish --dry-run` and prints the tarball contents, name, version
   and tag; no tag is created.
3. Run it again with **dry-run** unticked and approve. The workflow
   publishes with `npm publish ./release/<tarball> --registry
   https://npm.pkg.github.com` (npm 11.21.1, Node.js 24), then creates the
   tag. It passes no `--provenance`: GitHub Packages does not document
   npm provenance.
4. Check the package page on GitHub: version, linked repository and
   visibility (see prerequisite 3), then, with a token that has
   `read:packages`:

   ```sh
   npm view @open-ocpp-trace/<package>@<version> dependencies --registry=https://npm.pkg.github.com
   ```

   For `jsonl`, it must show the exact `core` version.

A real publish is refused from any branch other than `main`. If `publish`
succeeds and `tag` fails, use « Re-run failed jobs » on that run, not
« Re-run all jobs »: the version is then published and a new `verify`
would refuse it.

## Dry run

A dry run (the default) runs the whole `verify` job and
`npm publish --dry-run` on the verified tarball, then stops: nothing is
sent to the registry and no tag is created. It still needs the
`github-packages` environment approval.

To check the tarballs locally instead, from `typescript/`:

```sh
vp run -r pack
sh scripts/pack-release.sh /tmp/open-ocpp-trace-release core jsonl
sh scripts/verify-packages.sh /tmp/open-ocpp-trace-release/*.tgz
npm publish /tmp/open-ocpp-trace-release/open-ocpp-trace-core-<version>.tgz --registry https://npm.pkg.github.com --dry-run
```
