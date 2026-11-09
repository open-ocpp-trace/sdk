#!/bin/sh
# Clean-consumer smoke test of the packed packages.
#
# Builds every package, packs core and jsonl with `bun pm pack` (which
# rewrites `workspace:*` to a version), installs both tarballs with npm
# into a throwaway project outside the workspace, then:
#   1. runs smoke-consumer/smoke.mjs under Node.js and under Bun: it
#      imports every public entry point and writes and reads one record;
#   2. type-checks smoke-consumer/consumer.ts with `tsc --noEmit`, once
#      with `moduleResolution: "bundler"` and once with "nodenext".
# No custom export condition is set, so the packages resolve to `dist/`
# exactly as for a published install. Exits non-zero on the first failure.
#
# Run from typescript/: `vp run smoke`. Set SMOKE_KEEP=1 to keep the
# temporary directory for inspection.

set -eu

workspace=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
fixtures="$workspace/scripts/smoke-consumer"
tsc="$workspace/node_modules/typescript/bin/tsc"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/open-ocpp-trace-smoke.XXXXXX")
cleanup() {
  if [ "${SMOKE_KEEP:-}" = 1 ]; then
    echo "smoke: kept $tmp"
  else
    rm -rf -- "$tmp"
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

step() {
  printf '\nsmoke: %s\n' "$1"
}

step "build every package"
(cd "$workspace" && vp run -r pack)

step "pack core and jsonl"
mkdir "$tmp/tarballs"
for package in core jsonl; do
  (cd "$workspace/packages/$package" && bun pm pack --destination "$tmp/tarballs" --quiet)
done

step "install the tarballs into a project outside the workspace"
consumer="$tmp/consumer"
mkdir "$consumer"
cp "$fixtures/smoke.mjs" "$fixtures/consumer.ts" "$fixtures"/tsconfig.*.json "$consumer/"
cat > "$consumer/package.json" <<'EOF'
{
  "name": "open-ocpp-trace-smoke-consumer",
  "private": true,
  "type": "module"
}
EOF
(cd "$consumer" && npm install --no-audit --no-fund --ignore-scripts \
  "$tmp"/tarballs/open-ocpp-trace-core-*.tgz \
  "$tmp"/tarballs/open-ocpp-trace-jsonl-*.tgz)

step "import every entry point under Node.js"
(cd "$consumer" && node smoke.mjs)

step "import every entry point under Bun"
(cd "$consumer" && bun --no-install smoke.mjs)

for resolution in bundler nodenext; do
  step "type-check a TypeScript consumer (moduleResolution: $resolution)"
  (cd "$consumer" && node "$tsc" --project "tsconfig.$resolution.json")
done

step "passed"
