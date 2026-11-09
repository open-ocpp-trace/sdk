# Open OCPP Trace — TypeScript

TypeScript implementation of the
[Open OCPP Trace](https://github.com/open-ocpp-trace/specification) format.

| Package                  | Directory                          | Purpose                                     |
| ------------------------ | ---------------------------------- | ------------------------------------------- |
| `@open-ocpp-trace/core`  | [`packages/core`](packages/core)   | Record model and validation, no I/O         |
| `@open-ocpp-trace/jsonl` | [`packages/jsonl`](packages/jsonl) | JSONL reading and writing, on top of `core` |

Package boundaries are described in
[docs/architecture.md](../docs/architecture.md#package-boundaries).

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
```

`vp check --fix` applies formatting and safe lint fixes. `vp test watch`
re-runs the tests on change.

CI ([`.github/workflows/typescript.yml`](../.github/workflows/typescript.yml))
runs `conformance/fetch.sh` from the repository root, then the first four
commands above, on Node.js 22 and 24 with the Bun version of
`packageManager`. It runs when a pull request touches `typescript/`,
`conformance/` or the workflow, and on every push to `main`.

## Layout

```text
typescript/
├── package.json        private workspace root: tools and scripts only
├── bun.lock
├── tsconfig.base.json  shared compiler options
├── vite.config.ts      lint, format and test configuration
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
