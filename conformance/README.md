# Conformance

Every SDK implementation is tested against the same corpus: the schema and
reference traces published by
[open-ocpp-trace/specification](https://github.com/open-ocpp-trace/specification),
at one pinned commit. This directory pins that commit and fetches it. It does
not copy the corpus.

| File | Purpose |
| --- | --- |
| [`specification.lock`](specification.lock) | Upstream repository and the pinned 40-character commit SHA. |
| [`manifest.sha256`](manifest.sha256) | SHA-256 of every corpus file the SDK uses, in `sha256sum` format. |
| [`fetch.sh`](fetch.sh) | Fetches the pinned commit and verifies it against the manifest. |
| `.cache/specification/` | Local checkout of the pinned commit. Gitignored. |

## Fetching the corpus

```sh
conformance/fetch.sh
```

The script needs a POSIX shell, `git`, and `sha256sum` or `shasum`. It does not
need any language runtime. It:

1. fetches exactly the pinned commit into `conformance/.cache/specification/`,
   or reuses the cache when it already holds that commit;
2. checks that the checked-out commit is the pinned one;
3. checks every file listed in `manifest.sha256`.

Any failure exits with a non-zero status and a message: an unreachable
repository, an unknown commit, a revision that is not a full SHA, a missing or
modified file. Nothing is skipped. Local development and CI run the same
command against the same pin; CI wiring is tracked in
[#3](https://github.com/open-ocpp-trace/sdk/issues/3).

## Updating the pinned revision

```sh
conformance/fetch.sh --update <40-character commit SHA>
```

This rewrites `specification.lock` and regenerates `manifest.sha256`. Only a
full commit SHA is accepted: branch names such as `main`, tags and short SHAs
are rejected, so no test ever runs against a moving target.

Commit both files in one pull request. The manifest diff shows reviewers which
fixtures were added, removed or changed upstream. Read the upstream changes
before approving, and update the implementations whose tests the new corpus
breaks in the same pull request.

## Using the corpus from an implementation

An implementation's conformance tests:

- run `conformance/fetch.sh` first, or require that it has run;
- read files from `conformance/.cache/specification/`, which is a stable path;
- **enumerate fixtures from `manifest.sha256`**, never by listing the cache
  directory. A missing cache then fails with a file-not-found error, instead
  of silently running zero tests.

The corpus files used are:

| Path in the cache | Content |
| --- | --- |
| `schema/trace-v1.schema.json` | The record schema (format v1.1). |
| `fixtures/<name>/trace.jsonl` | A reference trace, one record per line. |
| `fixtures/<name>/expected.json` | The consumer view a conformant consumer derives from it. |
| `LICENSE` | The upstream license, kept with the files it covers. |

How each fixture is described, and what the consumer view means, is
documented upstream in
[`fixtures/README.md`](https://github.com/open-ocpp-trace/specification/blob/main/fixtures/README.md)
and
[`conformance/README.md`](https://github.com/open-ocpp-trace/specification/blob/main/conformance/README.md).

## What the SDK asserts

`expected.json` mixes what a codec must get right with what an analysis tool
computes. The SDK separates the two.

### Codec conformance (mandatory)

Every implementation must pass these on every fixture:

- **Valid records.** Each line of `trace.jsonl` parses through `jsonl` and
  validates through `core` without error.
- **Schema agreement.** The implementation's record model accepts what the
  schema accepts. It is derived from or checked against
  `schema/trace-v1.schema.json` ([#6](https://github.com/open-ocpp-trace/sdk/issues/6)).
- **Version.** Each record's `schemaVersion` equals `expected.json`'s
  `schemaVersion` and is reported as supported.
- **Record identity.** The number of records and the per-type counts match
  `counts.records`, `counts.calls`, `counts.callResults` and
  `counts.callErrors`. Each record's position, `messageType` and `messageId`
  match `records[].index`, `records[].messageType` and `records[].messageId`.
- **Round-trip.** Reading a trace and writing it back preserves every
  record's `raw`, `meta`, unknown top-level fields, message identifiers and
  timestamp strings exactly.

### Analysis expectations (out of scope)

These fields of `expected.json` depend on the correlation rule between calls
and responses:

- `records[].action` on responses;
- `records[].correlatesWith`;
- `unansweredCalls`;
- `orphanResponses`.

Deriving them is analysis, which
[`docs/architecture.md`](../docs/architecture.md#out-of-scope) keeps outside
the generic SDK. Implementations do not assert them. A separate analysis
library that does derive them uses the same corpus.

### Invalid input and edge cases (implementation tests)

The upstream corpus contains only valid traces. Its known gaps include
CALLERROR records, SOAP transport and malformed frames. The SDK therefore
tests the following in each implementation's own suite, not in a second
shared corpus:

- invalid JSON and schema violations, with their diagnostics;
- unsupported `schemaVersion` values;
- unknown fields and `meta` extensions;
- oversized lines, CRLF line endings, a missing final newline and chunk
  boundaries.

See [#6](https://github.com/open-ocpp-trace/sdk/issues/6),
[#7](https://github.com/open-ocpp-trace/sdk/issues/7) and
[#9](https://github.com/open-ocpp-trace/sdk/issues/9). A case that every
implementation of the format should agree on is proposed to the specification
as a new fixture, rather than kept here.

## Licensing and provenance

The schema, fixtures and conformance material are published by the
specification under the Apache License 2.0. This repository commits only
their paths and hashes. The fetched cache keeps the upstream `LICENSE` next
to the files.

All fixture data is synthetic. It was seeded from the OCPP DebugKit scenario
suite (OCPP 1.6J), as recorded upstream in `fixtures/README.md`.
