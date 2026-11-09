# Releasing the TypeScript packages

> **Nothing is published yet.** Do not run a release with `dry-run`
> unticked until the maintainers have confirmed ownership of the
> `@open-ocpp-trace` scope on npm, protected the `npm` environment and
> then configured the trusted publisher, as described below. A dry run
> publishes nothing.

Each package of this workspace (`@open-ocpp-trace/core`,
`@open-ocpp-trace/jsonl`) is released on its own by the manually started
workflow
[`.github/workflows/release-typescript.yml`](../.github/workflows/release-typescript.yml).
It is never triggered by a push or a tag.

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
  version it depends on is not on npm.

## Changelog

Each package has a `CHANGELOG.md` in
[Common Changelog](https://common-changelog.org/) style:

- no `Unreleased` section; the entry is written in the release pull
  request, before the tag exists;
- one `## [x.y.z] - YYYY-MM-DD` heading per release, latest first, with a
  reference link to the tag;
- changes grouped under `### Changed`, `### Added`, `### Removed`,
  `### Fixed`, in that order, breaking changes first and marked
  **Breaking:**;
- the first release carries the notice `_Initial release._` instead of
  groups.

## Tags

A release creates the lightweight tag `<package name>@<version>`, for
example `@open-ocpp-trace/core@0.1.0`, on the commit the workflow ran on.
The workflow creates it after a successful publish; do not create it by
hand.

## Prerequisites (once)

These need admin rights on npm and on the GitHub repository; they are not
done yet.

1. **npm scope.** Confirm that the `open-ocpp-trace` npm organization owns
   the `@open-ocpp-trace` scope and add the maintainers to it.
2. **GitHub environment `npm`** (Settings → Environments), before the
   trusted publisher: required reviewers (the maintainers) and deployment
   branches restricted to `main`. The publish job of every run, dry runs
   included, waits for a reviewer and, with that branch rule, runs only
   from `main`; on another branch only the `verify` job proves the
   package. Enable « Prevent self-review » only when at least two people
   are required reviewers, otherwise the person who starts a run can
   never approve it.

   This order matters. npm trusts any run of `release-typescript.yml`
   in the `npm` environment, and checks nothing else. GitHub creates a
   missing environment, unprotected, the first time a job names it. A
   trusted publisher configured before the environment is protected
   would let anyone with write access dispatch a modified workflow from
   a branch and publish.

3. **Trusted publisher, per package.** In the package settings on
   npmjs.com, « Trusted Publisher », add GitHub Actions with:
   - organization or user `open-ocpp-trace`, repository `sdk`;
   - workflow filename `release-typescript.yml` (file name only, exact
     case);
   - environment `npm`;
   - allowed actions: enable direct `npm publish`. New configurations
     only allow `npm stage publish` by default, which this workflow does
     not use.

   npm configures a trusted publisher on an existing package, and a new
   configuration must complete a successful publish within two days. How
   the very first version of each package is published is to be decided
   by the maintainers before the first release.

4. **After the first trusted publish**, in the package settings,
   « Publishing access », select « Require two-factor authentication and
   disallow tokens », and revoke any automation token.
5. The repository must stay public: npm only generates provenance for a
   public package published from a public repository.

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
5. checks that the tag and the npm version do not exist yet and, for a
   real release, that the version is not `0.0.0` and that the
   `@open-ocpp-trace/*` dependencies of the tarball are on npm.

The `publish` job publishes **that** tarball, uploaded as an artifact; it
does not rebuild.

## Permissions

- The workflow token is read-only (`contents: read`) by default.
- Only `publish` gets `id-token: write`, for the OIDC token of npm trusted
  publishing; it runs in the `npm` environment. No npm token is stored in
  the repository.
- Only `tag` gets `contents: write`, to create the tag through the Git
  references API. It runs after `publish` and only when not a dry run.

## Release a package

1. Open a pull request that sets `version` in
   `typescript/packages/<package>/package.json` and adds the release entry
   to its `CHANGELOG.md` (and the README if the supported format versions
   change). Merge it into `main`.
2. Actions → « Release TypeScript package » → « Run workflow » on `main`,
   choose the package, keep **dry-run** ticked. Approve the `npm`
   environment when asked. The publish step runs `npm publish --dry-run`
   and prints the tarball contents, name, version and tag; no tag is
   created.
3. Run it again with **dry-run** unticked and approve. The workflow
   publishes with `npm publish ./release/<tarball> --access public
   --provenance` (npm 11.21.1, Node.js 24), then creates the tag.
4. Check the package page on npmjs.com: version, files and the provenance
   badge linking to the workflow run.

A real publish is refused from any branch other than `main`. If `publish`
succeeds and `tag` fails, use « Re-run failed jobs » on that run, not
« Re-run all jobs »: the version is then on npm and a new `verify` would
refuse it.

## Dry run

A dry run (the default) runs the whole `verify` job and
`npm publish --dry-run` on the verified tarball, then stops: nothing is
sent to the registry and no tag is created. It still needs the `npm`
environment approval. Whether npm requests an OIDC token during a dry run
is not documented; if a dry run fails on authentication before the
trusted publisher exists, the `verify` job alone still proves the package.

To check the tarballs locally instead, from `typescript/`:

```sh
vp run -r pack
sh scripts/pack-release.sh /tmp/open-ocpp-trace-release core jsonl
sh scripts/verify-packages.sh /tmp/open-ocpp-trace-release/*.tgz
npm publish /tmp/open-ocpp-trace-release/open-ocpp-trace-core-<version>.tgz --access public --dry-run
```
