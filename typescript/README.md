# Open OCPP Trace — TypeScript

TypeScript implementation of the
[Open OCPP Trace](https://github.com/open-ocpp-trace/specification) format.

| Package                  | Directory                          | Purpose                                     |
| ------------------------ | ---------------------------------- | ------------------------------------------- |
| `@open-ocpp-trace/core`  | [`packages/core`](packages/core)   | Record model and validation, no I/O         |
| `@open-ocpp-trace/jsonl` | [`packages/jsonl`](packages/jsonl) | JSONL reading and writing, on top of `core` |

Package boundaries are described in
[docs/architecture.md](../docs/architecture.md#package-boundaries).

Each package is versioned and released on its own, with its own
`CHANGELOG.md`; [RELEASING.md](RELEASING.md) describes the release
workflow, its prerequisites and the dry run. Nothing is published yet.

## Prerequisites

- [Bun](https://bun.sh/) 1.4.4, the version pinned by `packageManager` in
  [`package.json`](package.json). Bun is the package manager of the
  workspace; the published packages do not depend on it.
- [Node.js](https://nodejs.org/) 22.18+, 24.11+ or 26+, the range required
  by Vite+ (`engines` in [`package.json`](package.json)).
- The [Vite+](https://viteplus.dev/) command line, `vp`. The workspace pins
  `vite-plus` as a dev dependency, and a globally installed `vp` delegates to
  that local version.

## Commands

Run every command from this directory.

```sh
bun install --frozen-lockfile   # install the exact versions in bun.lock
vp check                        # format check, lint and type check
vp test                         # run the tests once
vp run -r pack                  # build every package into its dist/
vp run --filter @open-ocpp-trace/core pack   # build one package
vp run smoke                    # smoke-test the packed packages from a clean consumer
```

`vp check --fix` applies formatting and safe lint fixes. `vp test watch`
re-runs the tests on change.

`vp run smoke` runs [`scripts/smoke-consumer.sh`](scripts/smoke-consumer.sh)
(`sh scripts/smoke-consumer.sh` is the same). It builds every package,
packs `core` and `jsonl` as they are published, checks the tarballs (see
[Packed packages](#packed-packages)), installs both tarballs with
npm into a throwaway project outside the workspace, then imports every
public entry point and writes and reads one record back under Node.js and
under Bun, and type-checks a TypeScript consumer with `tsc --noEmit` under
the `bundler` and `nodenext` module resolutions. The consumer files live in
[`scripts/smoke-consumer/`](scripts/smoke-consumer). It needs `npm` on the
`PATH` and exits non-zero on the first failure; `SMOKE_KEEP=1` keeps the
temporary directory.

CI ([`.github/workflows/typescript.yml`](../.github/workflows/typescript.yml))
runs `conformance/fetch.sh` from the repository root, then the first four
commands above, on Node.js 22 and 24 with the Bun version of
`packageManager`, and the smoke test on Node.js 22. It runs when a pull
request touches `typescript/`, `conformance/` or the workflow, and on every
push to `main`.

### Packed packages

The tarballs installed by the smoke test are the ones a release publishes.
After `vp run -r pack`:

```sh
sh scripts/pack-release.sh <dir> [core] [jsonl]   # write the published tarballs to <dir>
sh scripts/verify-packages.sh <dir>/*.tgz         # check them
```

[`scripts/pack-release.sh`](scripts/pack-release.sh) packs each package
with `bun pm pack`, which replaces `workspace:*` with the real version,
then removes the development-only `@open-ocpp-trace/source` export
condition from the packed `package.json`, adds the repository `LICENSE` and
repacks with `npm pack`. The committed `package.json` keeps the condition.

[`scripts/verify-packages.sh`](scripts/verify-packages.sh) fails when a
tarball contains anything but `package.json`, `README.md`, `LICENSE` and
`dist/`, when an `exports` target is missing from the tarball, when the
source condition or a `workspace:` dependency is left, when
[publint](https://publint.dev/) `--strict` reports a problem, or when
[Are the Types Wrong?](https://arethetypeswrong.github.io/) (`attw
--profile esm-only`) cannot resolve the types of an entry point.

## Layout

```text
typescript/
├── package.json        private workspace root: tools and scripts only
├── bun.lock
├── tsconfig.base.json  shared compiler options
├── vite.config.ts      lint, format and test configuration
├── scripts/            release packing, package checks, smoke test
└── packages/
    ├── core/
    │   ├── src/        package sources, runtime-neutral
    │   ├── test/       tests, with their own tsconfig.json
    │   └── vite.config.ts  pack configuration
    └── jsonl/          same layout
```

The packages' sources are compiled with `lib: ["ES2022"]` and `types: []`:
no DOM, Node.js or Bun globals are available to them, so a runtime-specific
API in `src/` fails the type check. Tests have their own `tsconfig.json`
under `test/`.

### Working on a package without building its dependencies

Each package exports its sources under the `@open-ocpp-trace/source`
condition, before `types` and `default`. The type check (`customConditions`
in `tsconfig.base.json`) and the tests (`ssr.resolve.conditions` in
`vite.config.ts`) enable that condition, so `jsonl` is checked and tested
against the sources of `core` without a prior build. Published consumers do
not set the condition and resolve `dist/`.
