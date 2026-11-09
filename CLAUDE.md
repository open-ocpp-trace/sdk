# Open OCPP Trace SDK

Read `docs/architecture.md` before changing layout, packages or versioning,
and `conformance/README.md` before touching the corpus or conformance tests.

## Rules

- The format is owned by open-ocpp-trace/specification. Never copy or edit
  the schema or fixtures here; consume the pinned revision. Format changes go
  upstream first.
- No toolchain at the repository root (no root `package.json`, lockfile or
  scripts). Each language directory (`typescript/`, …) owns its build,
  lockfile, CI workflow and release.
- Create a directory only with the work that fills it; no `.gitkeep`
  placeholders. Planned directories are tracked by issues #3–#10.
- `core` has no I/O or runtime-specific API; `jsonl` depends on `core`,
  never the reverse.
- Conformance tests enumerate fixtures from `conformance/manifest.sha256`,
  never by listing the cache, so a missing corpus fails instead of running
  zero tests.

## Commands

```sh
conformance/fetch.sh                  # fetch and verify the pinned corpus
conformance/fetch.sh --update <sha>   # re-pin to a full commit SHA, regenerates the manifest
```

## Gotchas

- The prose format spec lives in shiv3/ocpp-cp-simulator at
  `docs/concepts/trace-format.md`; the specification README still cites the
  stale `docs/trace-format.md`.
- The specification has no tags or releases yet; pin by commit SHA.
