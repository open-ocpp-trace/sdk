#!/bin/sh
# Fetch and verify the pinned Open OCPP Trace specification corpus.
#
#   conformance/fetch.sh                  fetch the pinned revision and verify it
#   conformance/fetch.sh --update <sha>   pin another commit and regenerate the manifest
#
# Requires only a POSIX shell, git, and sha256sum or shasum.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
lock="$here/specification.lock"
manifest="$here/manifest.sha256"
cache="$here/.cache/specification"

die() {
  printf 'conformance: %s\n' "$*" >&2
  exit 1
}

read_lock() {
  [ -f "$lock" ] || die "missing lock file $lock"
  value=$(sed -n "s/^$1=//p" "$lock")
  [ -n "$value" ] || die "missing '$1=' entry in $lock"
  printf '%s\n' "$value"
}

is_revision() {
  case $1 in
    *[!0-9a-f]*) return 1 ;;
  esac
  [ ${#1} -eq 40 ]
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

# Leaves $cache as a checkout of exactly $2 from repository $1.
checkout() {
  repository=$1
  revision=$2
  if [ -d "$cache/.git" ] &&
    [ "$(git -C "$cache" rev-parse HEAD 2>/dev/null || true)" = "$revision" ]; then
    return 0
  fi
  rm -rf "$cache"
  mkdir -p "$cache"
  git -C "$cache" init -q
  git -C "$cache" fetch -q --depth 1 "$repository" "$revision" ||
    die "cannot fetch revision $revision from $repository"
  git -C "$cache" checkout -q --detach FETCH_HEAD
  head=$(git -C "$cache" rev-parse HEAD)
  [ "$head" = "$revision" ] || die "fetched $head, expected $revision"
}

verify() {
  [ -s "$manifest" ] || die "missing or empty manifest $manifest"
  (cd "$cache" && sha256 -c "$manifest" >/dev/null) ||
    die "corpus in $cache does not match $manifest"
}

write_manifest() {
  files=$(cd "$cache" && git ls-files -- LICENSE schema/trace-v1.schema.json \
    'fixtures/*/trace.jsonl' 'fixtures/*/expected.json' | LC_ALL=C sort)
  [ -n "$files" ] || die "no corpus files found at the requested revision"
  # shellcheck disable=SC2086 # paths contain no whitespace; word splitting is intended
  (cd "$cache" && sha256 $files) >"$manifest.tmp"
  mv "$manifest.tmp" "$manifest"
}

write_lock() {
  {
    printf '%s\n' '# Pinned revision of the Open OCPP Trace specification corpus.'
    printf '%s\n' '# Change it with: conformance/fetch.sh --update <commit-sha>'
    printf 'repository=%s\n' "$1"
    printf 'revision=%s\n' "$2"
  } >"$lock"
}

repository=$(read_lock repository)

case ${1:-} in
  '')
    revision=$(read_lock revision)
    is_revision "$revision" || die "revision in $lock is not a 40-character commit SHA: $revision"
    checkout "$repository" "$revision"
    verify
    printf 'conformance: specification %s verified in %s\n' "$revision" "$cache"
    ;;
  --update)
    [ $# -eq 2 ] || die "usage: $0 --update <40-character commit SHA>"
    is_revision "$2" || die "not a 40-character commit SHA: $2 (branches and tags are not accepted)"
    checkout "$repository" "$2"
    write_manifest
    write_lock "$repository" "$2"
    printf 'conformance: pinned specification %s; review the diff of %s\n' "$2" "$manifest"
    ;;
  *)
    die "usage: $0 [--update <40-character commit SHA>]"
    ;;
esac
