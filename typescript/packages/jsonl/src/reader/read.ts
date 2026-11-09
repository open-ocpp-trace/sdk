import type { TraceRecord } from "@open-ocpp-trace/core";

import { LineSplitter, type LineEvent } from "./line-splitter.ts";
import { parseRecord, type ReadResult } from "./parse.ts";

/** What the reader does with an unreadable line. */
export type OnErrorMode = "throw" | "yield";

/** A sequence of text or byte chunks, such as a file read piece by piece. */
export type ChunkSource = AsyncIterable<string | Uint8Array> | Iterable<string | Uint8Array>;

export interface ReadRecordsOptions {
  /**
   * Largest accepted line, in UTF-8 bytes, excluding its LF or CRLF
   * terminator. Defaults to 1 MiB. A longer line is a `line-too-long`
   * error, raised as soon as the bound is crossed, and the reader never
   * holds more than this many bytes of one line (plus one pending CR).
   */
  readonly maxLineBytes?: number;
  /**
   * `"throw"` (default): yield records and throw the first
   * `JsonlReadError`, ending the iteration.
   * `"yield"`: yield a {@link ReadResult} for every non-blank line and
   * carry on after errors.
   */
  readonly onError?: OnErrorMode;
}

/**
 * Reads trace records from a JSONL stream of string or `Uint8Array`
 * chunks, one record per line, without holding more than one line in
 * memory. See {@link LineSplitter} for the framing rules: LF or CRLF,
 * UTF-8 across chunk boundaries, a BOM at stream start only, blank lines
 * skipped but counted. A source mixing strings and bytes, or yielding
 * anything else, makes the iteration throw a `TypeError` in both modes.
 *
 * Arguments are checked when called, before any chunk is read: a plain
 * string source throws a `TypeError` (pass `[text]`), an invalid
 * `maxLineBytes` or `onError` a `RangeError`.
 */
export function readRecords(
  source: ChunkSource,
  options?: ReadRecordsOptions & { readonly onError?: "throw" },
): AsyncIterable<TraceRecord>;
export function readRecords(
  source: ChunkSource,
  options: ReadRecordsOptions & { readonly onError: "yield" },
): AsyncIterable<ReadResult>;
export function readRecords(
  source: ChunkSource,
  options?: ReadRecordsOptions,
): AsyncIterable<TraceRecord | ReadResult>;
export function readRecords(
  source: ChunkSource,
  options: ReadRecordsOptions = {},
): AsyncIterable<TraceRecord | ReadResult> {
  if (typeof source === "string") {
    // A string is an Iterable<string> of code points: reading it would
    // work, one code point per chunk.
    throw new TypeError("readRecords takes a sequence of chunks; pass a whole text as [text]");
  }
  const onError = options.onError ?? "throw";
  if (onError !== "throw" && onError !== "yield") {
    throw new RangeError(`onError must be "throw" or "yield", got ${String(onError)}`);
  }
  const splitter =
    options.maxLineBytes === undefined
      ? new LineSplitter()
      : new LineSplitter({ maxLineBytes: options.maxLineBytes });
  return onError === "throw" ? records(source, splitter) : results(source, splitter);
}

function toResult(event: LineEvent): ReadResult {
  return event.type === "line"
    ? parseRecord(event.text, { line: event.line })
    : { ok: false, error: event.error };
}

async function* results(
  source: ChunkSource,
  splitter: LineSplitter,
): AsyncGenerator<ReadResult, void, undefined> {
  for await (const chunk of source) {
    for (const event of splitter.push(chunk)) yield toResult(event);
  }
  for (const event of splitter.end()) yield toResult(event);
}

async function* records(
  source: ChunkSource,
  splitter: LineSplitter,
): AsyncGenerator<TraceRecord, void, undefined> {
  for await (const result of results(source, splitter)) {
    if (!result.ok) throw result.error;
    yield result.record;
  }
}
