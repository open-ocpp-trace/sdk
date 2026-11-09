# Changelog

All notable changes to `@open-ocpp-trace/core` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- Typed model of Open OCPP Trace records (`TraceRecord`, discriminated by
  `messageType`) for format version `"1.1"`.
- Runtime validation with `validateRecord`, which reports every broken rule,
  and `assertRecord`, which throws `TraceValidationError`.
- Support for any `"1.<minor>"` format version, with
  `isSupportedSchemaVersion`, `SCHEMA_VERSION` and `SUPPORTED_SCHEMA_MAJOR`.
- Preservation of unknown fields and `meta`: validation returns the input
  object as is.

[unreleased]: https://github.com/open-ocpp-trace/sdk/compare/%40open-ocpp-trace%2Fcore%400.1.0...HEAD
[0.1.0]: https://github.com/open-ocpp-trace/sdk/tree/%40open-ocpp-trace%2Fcore%400.1.0
