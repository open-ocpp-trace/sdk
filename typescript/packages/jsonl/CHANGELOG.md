# Changelog

All notable changes to `@open-ocpp-trace/jsonl` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- JSONL reader: `parseRecord` for one line and `readRecords` for a stream of
  string or `Uint8Array` chunks, validating every record with
  `@open-ocpp-trace/core`.
- JSONL writer: `serializeRecord` for one line, `serializeRecords` and
  `writeRecords` for a stream to any object with a `write` method.
- Entry points `@open-ocpp-trace/jsonl/reader` and
  `@open-ocpp-trace/jsonl/writer`, and `SCHEMA_VERSION` re-exported from
  core.
- Unknown fields, `meta`, `raw`, identifiers and timestamp strings survive a
  read and a write unchanged.

[unreleased]: https://github.com/open-ocpp-trace/sdk/compare/%40open-ocpp-trace%2Fjsonl%400.1.0...HEAD
[0.1.0]: https://github.com/open-ocpp-trace/sdk/tree/%40open-ocpp-trace%2Fjsonl%400.1.0
