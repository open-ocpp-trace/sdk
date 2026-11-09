# Contributing

Thanks for helping build the Open OCPP Trace SDK. Issues and pull requests
are welcome, especially from people who produce or consume OCPP traces.

Read [docs/architecture.md](docs/architecture.md) before changing the layout,
a package boundary or the versioning, and
[conformance/README.md](conformance/README.md) before touching the corpus or
the conformance tests.

## Where a change belongs

The trace format is owned by
[open-ocpp-trace/specification](https://github.com/open-ocpp-trace/specification),
not by this repository. A change to the format, whether a new field, enum
value, validation rule or version, is proposed there first:

- the record schema,
  [`schema/trace-v1.schema.json`](https://github.com/open-ocpp-trace/specification/blob/main/schema/trace-v1.schema.json);
- the reference traces,
  [`fixtures/`](https://github.com/open-ocpp-trace/specification/tree/main/fixtures);
- the producer and consumer conformance rules,
  [`conformance/`](https://github.com/open-ocpp-trace/specification/tree/main/conformance);
- its contribution rules,
  [`CONTRIBUTING.md`](https://github.com/open-ocpp-trace/specification/blob/main/CONTRIBUTING.md).

Once the change is merged upstream, a pull request here re-pins the corpus
(`conformance/fetch.sh --update <sha>`, see
[Updating the pinned revision](conformance/README.md#updating-the-pinned-revision))
and implements it. A pull request that alters the format here directly is
redirected upstream. Never copy or edit the schema or fixtures in this
repository.

A test case that every implementation should agree on is proposed upstream as
a new fixture. A case specific to one implementation, such as a diagnostic
message or a chunk boundary, stays in that implementation's tests.

## Prerequisites

Every implementation needs the conformance corpus, which needs only a POSIX
shell, `git`, and `sha256sum` or `shasum`. Fetch it from the repository root:

```sh
conformance/fetch.sh
```

The repository root carries no toolchain. Install only the tools of the
implementation you work on.

### TypeScript

Details: [typescript/README.md](typescript/README.md#prerequisites).

- [Bun](https://bun.sh/) 1.4.4, the version pinned by `packageManager` in
  [`typescript/package.json`](typescript/package.json);
- [Node.js](https://nodejs.org/) 22.18+, 24.11+ or 26+, required by Vite+;
- the [Vite+](https://viteplus.dev/) command line, `vp`.

These are development requirements. What the published packages support at
runtime is in [docs/compatibility.md](docs/compatibility.md).

## Checks

### TypeScript

Run from `typescript/`:

```sh
bun install --frozen-lockfile   # install the exact versions in bun.lock
vp check                        # format check, lint and type check
vp test                         # run the tests once
vp run -r pack                  # build every package into its dist/
vp run smoke                    # pack, install and import from a clean consumer
```

`vp check --fix` applies formatting and safe lint fixes. Run it, then
`vp check`, before each commit.

Shell scripts are checked with `shellcheck`:

```sh
shellcheck conformance/fetch.sh typescript/scripts/smoke-consumer.sh
```

### What CI requires

The workflow
[`.github/workflows/typescript.yml`](.github/workflows/typescript.yml) runs
when a pull request touches `typescript/`, `conformance/` or the workflow
itself, and on every push to `main`. Its jobs are:

| Job | Runs |
| --- | --- |
| `Shellcheck shell scripts` | `shellcheck` on the shell scripts |
| `TypeScript (Node.js 22)`, `TypeScript (Node.js 24)` | `conformance/fetch.sh`, then install, `vp check`, `vp test`, `vp run -r pack` |
| `Clean-consumer smoke test` | `typescript/scripts/smoke-consumer.sh` on Node.js 22 |
| `ci-result` | succeeds when every job above succeeded or was skipped by the path filter |

`ci-result` is the only required check. It always reports, so a
documentation-only pull request gets a green check without running the
builds. A pull request is mergeable only with `ci-result` green.

## Tests

- **Test first.** For a behaviour change, write the failing test, watch it
  fail, then implement. A bug fix comes with the test that reproduces it.
- **Conformance.** Conformance tests enumerate fixtures from
  `conformance/manifest.sha256`, never by listing the cache, so a missing
  corpus fails instead of running zero tests.
- **Claims are tested.** A runtime or format compatibility claim names the
  test or CI job that proves it, in
  [docs/compatibility.md](docs/compatibility.md). A new claim comes with its
  test.
- **Package boundaries.** `core` has no I/O; `jsonl` depends on `core`, never
  the reverse. The packages' sources use no runtime-specific API: no `node:*`,
  `Bun`, DOM or `process`. Tests may use Node.js APIs.

## Commits and pull requests

- **Conventional Commits.** For example `feat(jsonl): …`, `fix(core): …`,
  `docs: …`, `test: …`, `ci: …`. Mark a breaking change with `!` and a
  `BREAKING CHANGE:` footer.
- **Sign off every commit** (see [DCO](#developer-certificate-of-origin-dco)).
- **One concern per pull request.** Link the issue it addresses
  (`Closes #<n>`), and list the checks you ran.
- **Keep documentation in step.** A change to an API, a supported version or
  a runtime claim updates the package README and
  [docs/compatibility.md](docs/compatibility.md) in the same pull request.
- **Release notes.** A change visible to package users adds an entry to that
  package's `CHANGELOG.md` (see [Release notes](#release-notes)).

### Review

- Every pull request is reviewed by a maintainer before merging, and merged
  only with `ci-result` green.
- Reviewers check that a behaviour change has a test that fails without it,
  that format changes went upstream first, and that compatibility claims stay
  backed by a test.
- A pull request that re-pins the corpus is reviewed against the upstream
  changes: the `manifest.sha256` diff shows which fixtures changed.

Neither the review nor the commit conventions are enforced by CI; reviewers
check them.

## Release notes

Each package keeps its own `CHANGELOG.md`, following
[Common Changelog](https://common-changelog.org/): written for package users,
grouped by impact (`Changed`, `Added`, `Removed`, `Fixed`), with breaking
changes stated first and explicitly. Do not paste the commit log.

Packages are released per package and per implementation. For TypeScript,
the procedure is in [typescript/RELEASING.md](typescript/RELEASING.md), and
the changelogs are
[`typescript/packages/core/CHANGELOG.md`](typescript/packages/core/CHANGELOG.md)
and
[`typescript/packages/jsonl/CHANGELOG.md`](typescript/packages/jsonl/CHANGELOG.md).
How SDK and format versions relate is in
[docs/architecture.md](docs/architecture.md#versioning).

## Licensing

This repository is licensed under the
[Apache License, Version 2.0](LICENSE). By contributing you agree that your
contributions are licensed under the same terms (inbound = outbound).

The conformance corpus is not part of this repository: it is fetched from the
specification, which publishes its schema, fixtures and conformance material
under Apache-2.0 and keeps its `LICENSE` next to them. See
[Licensing and provenance](conformance/README.md#licensing-and-provenance).

## Developer Certificate of Origin (DCO)

As in the specification, contributions are accepted under the
[Developer Certificate of Origin](https://developercertificate.org), a
lightweight statement that you have the right to submit the work under the
license above. There is no CLA.

Certify it by adding a `Signed-off-by` line to each commit, with a real name
and email:

```text
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds this automatically.

## Ownership

The repository has no `CODEOWNERS` file. Owners are added only for
maintainers who explicitly agree to own a path, so that review requests and
permissions are never inferred from commit history. Until then, any
maintainer may review any path.
