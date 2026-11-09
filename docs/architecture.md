# Architecture

This document describes how the SDK repository is organised, what each part
is responsible for, and the rules that keep language implementations
independent of each other and of the specification.

## Layout

```text
sdk/
├── .github/            CI workflows, path-scoped per implementation   (planned, #3)
├── conformance/        Pinned specification corpus and how to run it   (present)
├── docs/               Cross-language documentation                    (present)
├── examples/           Runnable usage examples                         (planned)
├── typescript/         TypeScript implementation, Bun + Vite+          (present)
│   └── packages/
│       ├── core/       @open-ocpp-trace/core
│       └── jsonl/      @open-ocpp-trace/jsonl
├── README.md
├── CONTRIBUTING.md                                                     (planned, #4)
└── LICENSE
```

A directory is created only when it has content with an immediate purpose.
Placeholders such as empty folders or `.gitkeep` files are not added ahead of
the work that fills them.

## Responsibilities

### Specification repository

[open-ocpp-trace/specification](https://github.com/open-ocpp-trace/specification)
owns the format:

- the record schema, `schema/trace-v1.schema.json`;
- the reference traces in `fixtures/`, each with its expected consumer view;
- the producer and consumer conformance rules in `conformance/`.

### This repository

The SDK owns implementations of the format and their verification:

- language packages that model, validate, read and write records;
- the procedure that runs a pinned revision of the specification corpus
  against each implementation ([`conformance/`](../conformance/README.md)).

### Single source of truth for the schema

The SDK does not maintain a copy of the schema. Each implementation either
derives its types from the pinned upstream schema or checks them against it in
its tests (#6), so that a divergence fails the build instead of shipping. The
pinned revision is a full commit SHA, and changing it is a reviewed change in
this repository: see [`conformance/README.md`](../conformance/README.md).

When an implementation needs a change to the format, the change is proposed
in the specification repository first. No implementation adds fields, enum
values or rules of its own to the record schema.

## Package boundaries

Each implementation provides the same two packages. The names below are those
of the TypeScript implementation; other languages follow their ecosystem's
naming conventions while keeping the same split.

### `core`

Represents and validates individual trace records.

- Typed record model: `schemaVersion`, `timestamp`, `transport`,
  `direction`, `messageType`, `messageId`, `action`, `payload`, `raw`,
  `error`, `meta` and the other schema fields.
- Runtime validation of untrusted input with actionable diagnostics, kept
  distinct from compile-time type assertions.
- An explicit policy for supported `schemaVersion` values, unknown fields and
  `meta` extensions.
- Field fidelity: `raw`, message identifiers and timestamp strings are kept
  as received, without normalisation.

`core` has no I/O. It uses no filesystem, no streams, no global process state
and no runtime-specific API, so it runs unchanged in browsers, Node.js and
Bun. Details: #6.

### `jsonl`

Reads and writes Open OCPP Trace JSONL on top of `core`.

- Single-record parsing of one line.
- An incremental reader over a sequence of text or byte chunks, memory-bounded
  by record size rather than by stream size, with line-numbered errors.
- A writer and streaming serializer that emit one record per line.

`jsonl` works on generic chunk sequences. Adapters for a particular source,
such as a file, a Node.js stream or a browser `ReadableStream`, are thin
wrappers that applications or examples provide. Details: #7, #8.

### Dependency direction

```text
application ──▶ jsonl ──▶ core
     │                      ▲
     └──────────────────────┘
```

- `jsonl` depends on `core`. `core` depends on neither `jsonl` nor any
  application code.
- Applications may depend on `core` alone, for example to validate records
  received one by one over a transport.
- Neither package depends on a runtime-specific API. Runtime-specific code
  lives in applications, examples or a future, separately published adapter
  package.

### Out of scope

The following stay outside the generic SDK, in the applications that use it:

- OCPP wire decoding: interpreting `payload` against OCPP 1.6 or 2.0.1
  message schemas;
- logger adapters specific to a simulator, proxy or charging station;
- application storage, buffering and retries;
- viewer and analysis UI, including the consumer views computed from the
  fixtures;
- transports: SSE, WebSocket, Socket.IO and similar.

A feature belongs in the SDK only if every producer or consumer of the format
needs it in the same form.

## Public API and extension points

The exact signatures are defined by the implementation issues (#6, #7, #8) and
documented in each package. At the responsibility level, each implementation
exposes:

| Package | Public API |
| --- | --- |
| `core` | record types, version constants, record validation and its diagnostics |
| `jsonl` | single-line parse, incremental reader, writer / serializer |

Stable extension points are those of the format itself:

- **`meta`**: an object for producer-specific data. The conformance rules
  require producers to put extensions there, never in undeclared top-level
  fields. The SDK preserves `meta` intact through read and write.
- **Unknown top-level fields**: the schema allows them
  (`additionalProperties: true`) and consumers must ignore them for forward
  compatibility within a major version. The SDK preserves them through a
  round-trip rather than dropping them.
- **Source and sink adapters**: `jsonl` reads from and writes to generic
  chunk sequences, so any I/O source can be plugged in without changing the
  package.

## Versioning

The SDK version and the format version are distinct and evolve independently.

| | SDK version | Format version |
| --- | --- | --- |
| What | Semantic version of a published package | `schemaVersion` value in each record |
| Example | `@open-ocpp-trace/core@1.4.0` | `"1.1"` |
| Defined by | This repository | The specification |
| Changes when | The package API or behaviour changes | The specification changes |

- Each package follows [Semantic Versioning](https://semver.org/). A breaking
  change to its API is a major release, even if the format is unchanged.
- Supporting a new format version that is backward compatible within the same
  format major is a minor SDK release.
- Packages are versioned per package and per implementation: a TypeScript
  release does not imply a release of another language.
- Each package declares the format versions it reads and writes. The
  compatibility matrix and the policy for unsupported versions are documented
  in `docs/compatibility.md` (#4).

## Contribution principles for language isolation

- **Each language directory is self-contained.** It owns its manifest,
  lockfile, toolchain configuration, tests, CI workflow and release process.
  For TypeScript, all Bun and Vite+ configuration stays under `typescript/`.
- **The root carries no toolchain.** There is no root `package.json`, build
  script or lockfile. A contributor to one implementation installs only that
  implementation's tools.
- **CI is path-scoped.** A change under `typescript/` runs the TypeScript
  checks; a documentation-only change does not run every language's build
  (#3).
- **Shared assets are language-neutral.** `conformance/` and `docs/` contain
  data and prose, never code that requires one language's runtime to use them.
  `conformance/fetch.sh` needs only a POSIX shell and `git`.
- **Published packages are runtime-neutral.** Development tools, such as Bun,
  are not dependencies of the published packages.
- **Format changes start upstream.** A pull request here that would alter the
  record schema is redirected to the specification repository.

### Adding an implementation

A new language joins the repository as a new top-level directory named after
the language, such as `python/` or `java/`, which:

1. provides the `core` and `jsonl` responsibilities with the same boundaries;
2. runs the pinned conformance corpus from `conformance/`;
3. adds its own path-scoped CI workflow and release process;
4. adds a row to the implementations table in the [README](../README.md).
