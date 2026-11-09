# Open OCPP Trace — SDK

Libraries for reading, validating and writing
[Open OCPP Trace](https://github.com/open-ocpp-trace/specification) records:
an implementation-independent, versioned JSON/JSONL format for recording OCPP
message exchanges.

The SDK is a **codec**, not an analyzer. It turns trace records into typed,
validated values and back, so that simulators, proxies, CSMS implementations
and analysis tools do not each re-implement the format.

## Relationship to the specification

The format is defined in
[open-ocpp-trace/specification](https://github.com/open-ocpp-trace/specification),
which is authoritative and independent of this repository.

| Concern | Owner |
| --- | --- |
| Record schema ([`schema/trace-v1.schema.json`](https://github.com/open-ocpp-trace/specification/blob/main/schema/trace-v1.schema.json)) | specification |
| Reference traces ([`fixtures/`](https://github.com/open-ocpp-trace/specification/tree/main/fixtures)) | specification |
| Producer and consumer conformance rules ([`conformance/`](https://github.com/open-ocpp-trace/specification/tree/main/conformance)) | specification |
| Language implementations of the format | this repository |
| Running the shared corpus against those implementations | this repository |

The SDK consumes a **pinned revision** of the specification's schema and
fixtures ([`conformance/`](conformance/README.md)). It never
keeps its own copy of the schema. A change to the format is proposed in the
specification repository first, then implemented here.

The prose specification of the current format (v1.1) still lives in
[shiv3/ocpp-cp-simulator](https://github.com/shiv3/ocpp-cp-simulator), in
[`docs/concepts/trace-format.md`](https://github.com/shiv3/ocpp-cp-simulator/blob/main/docs/concepts/trace-format.md),
until it migrates to the specification repository.

## Scope

In scope:

- a typed model of trace records and runtime validation against the schema;
- JSONL parsing, incremental reading and writing of versioned traces.

Out of scope, left to the applications that use the SDK:

- decoding OCPP wire messages (payload semantics, OCPP JSON schemas);
- logger adapters for a specific simulator or charging station;
- storage, buffering and retries;
- viewer or analysis UI;
- transports such as SSE, WebSocket or Socket.IO.

## Implementations

| Language | Directory | Packages | Status |
| --- | --- | --- | --- |
| TypeScript | [`typescript/`](typescript/README.md) | `@open-ocpp-trace/core`, `@open-ocpp-trace/jsonl` | in development |

Each implementation is self-contained: it owns its toolchain, dependencies,
CI and releases. The repository root imposes no language toolchain, so working
on one implementation never requires installing another's.

## Versioning

Two version numbers are involved, and they are independent:

- **SDK version**: the semantic version of each published package, for
  example `@open-ocpp-trace/core@1.4.0`. It changes when the package API or
  behaviour changes.
- **Format version**: the `schemaVersion` field carried by every trace
  record, for example `"1.1"`. It is defined by the specification and changes
  only when the specification changes.

Each package documents which format versions it reads and writes. See
[docs/architecture.md](docs/architecture.md#versioning).

## Documentation

- [Architecture](docs/architecture.md): layout, package boundaries,
  dependency direction and contribution principles.

## License

Licensed under the [Apache License, Version 2.0](LICENSE), like the
specification's schema, fixtures and conformance tests.
