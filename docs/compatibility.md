# Compatibility

This document states which trace format versions and which runtimes the SDK
packages support, and for each claim the test or CI job that proves it. A
claim without a test is listed as such.

Test paths are relative to `typescript/packages/`, script paths to the
repository root; CI jobs are those of
[`.github/workflows/typescript.yml`](../.github/workflows/typescript.yml).

## SDK version and format version

The SDK version (the semantic version of a package) and the format version
(the `schemaVersion` of a record) are independent. How each one changes, and
which SDK release a new format version calls for, is defined in
[docs/architecture.md § Versioning](architecture.md#versioning).

The TypeScript packages are not published yet: both are at version `0.0.0`.

## Format versions

### TypeScript

`@open-ocpp-trace/core` is built against the specification pinned in
[`conformance/specification.lock`](../conformance/specification.lock), format
version `"1.1"` (`SCHEMA_VERSION`). `@open-ocpp-trace/jsonl` validates every
record it reads with `core`, so it follows the same policy.

| Claim | Evidence |
| --- | --- |
| The record model agrees with the pinned schema: same fields, required fields and enum values, and the same verdict as a JSON Schema validator on every corpus record and on synthetic records | `core/test/schema-equivalence.test.ts`: "validateRecord agrees with the pinned JSON Schema", "the model matches the pinned JSON Schema" |
| Every record of every fixture in the pinned corpus is valid | `core/test/corpus.test.ts` ("line … is a valid record, returned as is"); `jsonl/test/reader/corpus.test.ts` ("conformance corpus through readRecords") |
| `SCHEMA_VERSION` is `"1.1"` and belongs to the supported major | `core/test/index.test.ts` ("SCHEMA_VERSION"); `jsonl/test/index.test.ts` |
| Any `"1.<minor>"` is accepted: `"1.0"`, `"1.1"`, `"1.10"`, `"1.42"` | `core/test/validate.test.ts` ("validateRecord: schemaVersion policy", "accepts …"); `core/test/index.test.ts` ("isSupportedSchemaVersion"); `jsonl/test/edge-cases.test.ts` ("reads any 1.\<minor\> record and keeps its version as written") |
| Another major (`"2.0"`, `"0.9"`) is rejected as `unsupported-version` | `core/test/validate.test.ts` ("rejects another major …"); `jsonl/test/edge-cases.test.ts` ("rejects … as a validation error on its line") |
| A malformed version (`"1"`, `"v1.1"`, `"1.1.0"`, `"01.1"`, `"1.01"`) is rejected as `format` | `core/test/validate.test.ts` ("rejects malformed …"); `jsonl/test/edge-cases.test.ts` |
| Unknown top-level fields and `meta` are preserved on validation | `core/test/validate.test.ts` ("preserves unknown top-level, error and meta fields by identity") |
| Unknown fields, `meta`, `raw`, identifiers and timestamp strings survive a read and a write | `jsonl/test/reader/parse-record.test.ts` ("preserves raw, timestamps, identifiers and unknown fields as written"); `jsonl/test/writer/round-trip.test.ts` ("round-trips unknown fields, meta, raw and an offset timestamp"); `jsonl/test/conformance/consumer-view.test.ts` ("matches expected.json after a write then read round trip") |

The writer validates records with the same `core` rules before writing them,
and writes `schemaVersion` as given; it does not stamp a version. No writer
test exercises an unsupported `schemaVersion` specifically.

## Runtimes

Two kinds of requirement are involved:

- **Development toolchain**: what a contributor needs to build and test the
  workspace. `engines` in the private workspace
  [`typescript/package.json`](../typescript/package.json) requires Node.js
  `^22.18 || ^24.11 || >=26`, the range of Vite+, and `packageManager` pins
  Bun 1.4.4. See [CONTRIBUTING.md](../CONTRIBUTING.md#prerequisites).
- **Consumer runtime**: where the published packages run. They declare no
  `engines` field, have no runtime-specific dependency, and are compiled to
  ES2022 ESM.

### Consumer runtime matrix

| Runtime | Status | Evidence |
| --- | --- | --- |
| Node.js 22 | tested | Job `TypeScript (Node.js 22)` runs the whole test suite against the packages' sources. Job `Clean-consumer smoke test` verifies the packed tarballs (`typescript/scripts/verify-packages.sh`), installs them on Node.js 22, imports every entry point and writes and reads one record (`typescript/scripts/smoke-consumer.sh`, `typescript/scripts/smoke-consumer/smoke.mjs`). |
| Node.js 24 | tested, sources only | Job `TypeScript (Node.js 24)` runs the whole test suite against the sources. The packed packages are not exercised on 24. |
| Node.js 26 | untested | Allowed by the development toolchain range only; in no CI job. |
| Node.js below 22 | untested | In no CI job; the packages declare no `engines`. |
| Bun 1.4.4 | smoke-tested | Job `Clean-consumer smoke test` imports every entry point of the packed packages and writes and reads one record under Bun (`bun --no-install smoke.mjs` in `smoke-consumer.sh`). The test suite does not run under Bun. |
| Browsers | claimed, enforced at compile time | Not run. The packages' sources compile with `lib: ["ES2022"]` and `types: []` ([`typescript/tsconfig.base.json`](../typescript/tsconfig.base.json)), so a Node.js, Bun or DOM API fails `vp check` in the `TypeScript (Node.js …)` jobs; each package is bundled with `platform: "neutral"` (`core/vite.config.ts`, `jsonl/vite.config.ts`). |
| Deno | claimed, enforced at compile time | Same evidence as browsers; not run. |

### Runtime globals

| Requirement | Evidence |
| --- | --- |
| `core` needs no global beyond ES2022. | Compile-time only: `lib: ["ES2022"]`, `types: []`. |
| `jsonl` needs a global `TextDecoder` only to read `Uint8Array` chunks. Without one, the first byte chunk throws a `TypeError`; string chunks are still read. | `jsonl/test/reader/read-records.test.ts` ("readRecords without a global TextDecoder"). |
| The packages do not use `TextEncoder`. A sink that encodes lines, such as a `TextEncoderStream`, is the caller's. | No use in `core/src` or `jsonl/src`; the writer emits strings (`jsonl/test/writer/write-records.test.ts`, "writes every line and resolves with the count"). |

### TypeScript consumers

| Claim | Evidence |
| --- | --- |
| The published exports and types resolve: only `package.json`, `README.md`, `LICENSE` and `dist/` are packed, every `exports` target exists, and TypeScript resolves the types of every entry point under the `node16` (ESM) and `bundler` resolutions | Job `Clean-consumer smoke test`: `typescript/scripts/verify-packages.sh` on each packed tarball (`scripts/release-manifest.ts inspect`, `publint --strict`, `attw --profile esm-only`) |
| The packed type declarations type-check with TypeScript 6.0.3 under the `bundler` and `nodenext` module resolutions | Job `Clean-consumer smoke test`: `tsc --noEmit` on `typescript/scripts/smoke-consumer/consumer.ts` with `typescript/scripts/smoke-consumer/tsconfig.bundler.json` and `tsconfig.nodenext.json` |

Other TypeScript versions are not tested.

## Changing a claim

A pull request that adds, widens or drops a claim in this document changes
the test or CI job that proves it in the same pull request. See
[CONTRIBUTING.md](../CONTRIBUTING.md#tests).
