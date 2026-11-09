# @open-ocpp-trace/core

Typed model and runtime validation of
[Open OCPP Trace](https://github.com/open-ocpp-trace/specification) records.

This package checks one record at a time and does no I/O. To read or write
JSONL trace files, use `@open-ocpp-trace/jsonl`, which builds on it.

## Install

```sh
npm install @open-ocpp-trace/core
```

The package is ESM only and has no runtime dependencies. It uses no Node.js,
Bun or DOM API, so it runs unchanged in browsers, Node.js and Bun.

## Supported format versions

Supported format versions: `schemaVersion` **1.x**. The package version
follows Semantic Versioning independently of the format version.

The package accepts records of format version **1.x** and is built against
version `"1.1"` of the specification:

| Export                   | Value   | Meaning                                    |
| ------------------------ | ------- | ------------------------------------------ |
| `SCHEMA_VERSION`         | `"1.1"` | version of the pinned specification        |
| `SUPPORTED_SCHEMA_MAJOR` | `1`     | major version accepted by `validateRecord` |

`schemaVersion` must be `"1.<minor>"` with ASCII digits only and no leading
zero (`"0"` itself is allowed). Minor versions are forward compatible within a
major, so `"1.0"`, `"1.10"` and `"1.42"` are accepted. A well-formed version of
another major (`"2.0"`) is rejected as `unsupported-version`; a malformed value
(`"1"`, `"v1.1"`, `"1.1.0"`, `"01.1"`, `"1.01"`) as `format`.
`isSupportedSchemaVersion(value)` applies the same rule on its own.

## Usage

```ts
import { validateRecord } from "@open-ocpp-trace/core";

const result = validateRecord(JSON.parse(line));
if (result.ok) {
  const record = result.record; // TraceRecord
  if (record.messageType === "CALL") console.log(record.action);
} else {
  for (const issue of result.issues) console.error(issue.path, issue.code, issue.message);
}
```

`assertRecord` returns the record or throws:

```ts
import { assertRecord, TraceValidationError } from "@open-ocpp-trace/core";

try {
  const record = assertRecord(input);
} catch (error) {
  if (error instanceof TraceValidationError) console.error(error.issues);
  else throw error;
}
```

## API

| Export                                                       | Description                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `validateRecord(input: unknown)`                             | `{ ok: true, record }` or `{ ok: false, issues }`; does not throw                   |
| `assertRecord(input: unknown)`                               | the record, or throws `TraceValidationError`                                        |
| `TraceValidationError`                                       | `Error` subclass with `issues: readonly ValidationIssue[]`                          |
| `isSupportedSchemaVersion(value)`                            | whether `value` is a `"1.<minor>"` string                                           |
| `SCHEMA_VERSION`, `SUPPORTED_SCHEMA_MAJOR`                   | see [Supported format versions](#supported-format-versions)                         |
| `TRANSPORTS`, `DIRECTIONS`, `MESSAGE_TYPES`                  | allowed values, in schema order                                                     |
| `TraceRecord`                                                | `CallRecord \| CallResultRecord \| CallErrorRecord`, discriminated by `messageType` |
| `CallRecord`, `CallResultRecord`, `CallErrorRecord`          | the record of each `messageType`: CALL, CALLRESULT, CALLERROR                       |
| `TraceError`                                                 | the `error` object of a CALLERROR                                                   |
| `Transport`, `Direction`, `MessageType`                      | string unions derived from the constants                                            |
| `ValidationResult`, `ValidationIssue`, `ValidationIssueCode` | diagnostics types                                                                   |

The record type follows the schema's conditional rules: a `CallRecord`
requires `action`, a `CallErrorRecord` requires `error`, and the other two
forbid `error`.

Validation returns the input object itself: nothing is cloned, normalised or
removed. The timestamp is kept as received.

## Diagnostics

`validateRecord` reports every broken rule, not only the first. Each issue is

```ts
interface ValidationIssue {
  path: string; // JSON Pointer (RFC 6901) into the input; "" is the record itself
  code: ValidationIssueCode;
  message: string; // names the expected value
}
```

| Code                  | Meaning                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `required`            | a required field is absent (`action` on a CALL, `error` on a CALLERROR included) |
| `forbidden`           | `error` is present on a CALL or CALLRESULT                                       |
| `type`                | a value has the wrong JSON type, or the input is not an object                   |
| `enum`                | a string is not one of the allowed values                                        |
| `format`              | `timestamp` is not a date-time, or `schemaVersion` is malformed                  |
| `minimum`             | `connectorId` is below 0                                                         |
| `unsupported-version` | `schemaVersion` is well formed but of another major version                      |

For example, `{ ..., "connectorId": -1 }` gives
`{ path: "/connectorId", code: "minimum", message: "expected an integer >= 0, got -1" }`.

A field whose value is `undefined` counts as absent, as in JSON. The
per-message-type rules are checked only once `messageType` is valid, so an
invalid `messageType` is reported alone rather than with the issues that
follow from it.

## Unknown fields and `meta`

The schema allows additional top-level properties, and validation keeps them:
the record you get back is the object you passed in.

The `TraceRecord` type has no index signature, on purpose. The format tells
producers to put extensions in `meta`, so an object literal with an extra
top-level field is a type error, and a misspelt field name is caught. `meta` is
typed `Record<string, unknown>` and preserved as is.

To read a top-level field this package does not model yet, for instance one
added by a newer minor version, widen the type explicitly:

```ts
const extended = record as TraceRecord & { newField?: unknown };
console.log(extended.newField);
```

## Timestamps

`timestamp` must be a JSON Schema `date-time`. The check reproduces the
`date-time` format of [ajv-formats](https://github.com/ajv-validator/ajv-formats)
3.0.1 in its default full mode, so this package and a schema validator agree on
every value: a timezone is required, and the date must exist in the calendar
(`2023-02-29` is rejected).

ajv-formats is more permissive than a strict reading of RFC 3339 § 5.6, and so
is this package:

- `T` and `Z` are case-insensitive, and any whitespace character can separate
  the date from the time (`2025-01-15 10:30:00Z`);
- the offset may omit its colon (`+0100`) or its minutes (`+01`);
- year `0000` is accepted;
- a leap second (`:60`) is accepted at 23:59 UTC once the offset is applied,
  whatever the date.

There is no intended divergence from the schema: the test suite compiles the
pinned schema with Ajv and checks that both give the same verdict on every
record of the conformance corpus and on about 300 valid and invalid variants.

## License

Apache-2.0
