// Access to the pinned conformance corpus for tests.
//
// The corpus lives in `conformance/.cache/specification/` at the repository
// root, fetched by `conformance/fetch.sh`. Fixtures are enumerated from
// `conformance/manifest.sha256`, never by listing the cache, so that a
// missing or incomplete cache fails the tests instead of running none.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Root of the repository (this file is `typescript/packages/core/test/support/`). */
export const REPO_ROOT: string = resolve(HERE, "../../../../..");

export const CONFORMANCE_DIR: string = join(REPO_ROOT, "conformance");
export const MANIFEST_PATH: string = join(CONFORMANCE_DIR, "manifest.sha256");
/** Checkout of the pinned specification; manifest paths are relative to it. */
export const SPECIFICATION_DIR: string = join(CONFORMANCE_DIR, ".cache", "specification");
export const SCHEMA_PATH: string = join(SPECIFICATION_DIR, "schema", "trace-v1.schema.json");

const FETCH_HINT = "run conformance/fetch.sh from the repository root";

/** Absolute path of a corpus file, failing with a fetch hint if absent. */
function corpusPath(relativePath: string): string {
  const path = join(SPECIFICATION_DIR, relativePath);
  if (!existsSync(path)) {
    throw new Error(`missing corpus file ${path}: ${FETCH_HINT}`);
  }
  return path;
}

/** Reads a corpus file by its manifest path, failing with a fetch hint if absent. */
export function readCorpusFile(relativePath: string): string {
  return readFileSync(corpusPath(relativePath), "utf8");
}

/** The raw bytes of a corpus file, read directly so that nothing is normalised. */
export function readCorpusBytes(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(corpusPath(relativePath)));
}

/** Every path listed in the manifest, relative to {@link SPECIFICATION_DIR}. */
export function manifestPaths(): string[] {
  if (!existsSync(MANIFEST_PATH)) throw new Error(`missing manifest ${MANIFEST_PATH}`);
  return readFileSync(MANIFEST_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const match = /^[0-9a-f]{64} {2}(.+)$/.exec(line);
      if (!match?.[1]) throw new Error(`malformed manifest line: ${JSON.stringify(line)}`);
      return match[1];
    });
}

/** One fixture's trace: its manifest path and its non-empty lines. */
export interface FixtureTrace {
  /** Fixture name, the directory under `fixtures/`. */
  readonly name: string;
  /** Path relative to {@link SPECIFICATION_DIR}. */
  readonly path: string;
  /** Non-empty lines, with their 1-based line number in the file. */
  readonly lines: ReadonlyArray<{ readonly number: number; readonly text: string }>;
}

/** Every `fixtures/<name>/trace.jsonl` listed in the manifest, read from the cache. */
export function fixtureTraces(): FixtureTrace[] {
  return manifestPaths()
    .filter((path) => path.endsWith("/trace.jsonl"))
    .map((path) => {
      const lines = readCorpusFile(path)
        .split("\n")
        .map((text, index) => ({ number: index + 1, text }))
        .filter((line) => line.text.trim() !== "");
      return { name: path.split("/").at(-2) ?? path, path, lines };
    });
}

/** The pinned JSON Schema of a record, parsed. */
export function readSchema(): Record<string, unknown> {
  if (!existsSync(SCHEMA_PATH)) throw new Error(`missing schema ${SCHEMA_PATH}: ${FETCH_HINT}`);
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) as Record<string, unknown>;
}
