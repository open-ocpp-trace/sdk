import type { TraceRecord } from "@open-ocpp-trace/core";

import { checkSerializeOptions, serializeAt, type SerializeRecordOptions } from "./serialize.ts";

/**
 * A sequence of records to write, such as an array or an async generator.
 * `RecordSource` holds `TraceRecord`s, as `readRecords` yields them;
 * `RecordSource<unknown>` is accepted with `{ validate: false }`.
 */
export type RecordSource<T = TraceRecord> = AsyncIterable<T> | Iterable<T>;

/**
 * Where `writeRecords` sends its lines. A returned promise is awaited
 * before the next record is pulled, which is how a slow sink applies
 * backpressure; a throw or a rejection ends the write.
 */
export interface LineSink {
  write(chunk: string): void | Promise<void>;
}

/**
 * Serialises records lazily, one JSONL line per record (see
 * `serializeRecord`). The next record is pulled only when the next line
 * is requested.
 *
 * Lines are strings ending in a single LF, with no BOM; encode them as
 * UTF-8 when writing bytes. The iteration stops at the first record that
 * cannot be written and throws a `JsonlWriteError` whose `index` is its
 * 0-based position; lines already yielded stay valid. An error thrown by
 * the source itself propagates unchanged.
 *
 * Options are checked when called: an invalid `validate` throws a
 * `TypeError` before any record is pulled.
 */
export function serializeRecords(
  records: RecordSource,
  options?: SerializeRecordOptions,
): AsyncIterable<string>;
export function serializeRecords(
  records: RecordSource<unknown>,
  options: SerializeRecordOptions & { readonly validate: false },
): AsyncIterable<string>;
export function serializeRecords(
  records: RecordSource<unknown>,
  options: SerializeRecordOptions = {},
): AsyncIterable<string> {
  return lines(records, checkSerializeOptions(options));
}

async function* lines(
  records: RecordSource<unknown>,
  validate: boolean,
): AsyncGenerator<string, void, undefined> {
  let index = 0;
  for await (const record of records) {
    yield serializeAt(record, validate, index);
    index += 1;
  }
}

/**
 * Writes records to `sink` as JSONL: UTF-8 text (the sink encodes the
 * strings it receives), one record per line, LF terminators, no BOM, and
 * nothing at all for an empty input.
 *
 * Each `sink.write` call is awaited before the next record is pulled, so
 * at most one write is in flight. A sink throw or rejection propagates
 * unchanged; a record that cannot be written rejects with a
 * `JsonlWriteError` carrying its `index`. Either way the lines written
 * before the failure are complete, and the sink is left open: closing or
 * flushing it is the caller's job.
 *
 * @returns the number of records written.
 */
export function writeRecords(
  records: RecordSource,
  sink: LineSink,
  options?: SerializeRecordOptions,
): Promise<number>;
export function writeRecords(
  records: RecordSource<unknown>,
  sink: LineSink,
  options: SerializeRecordOptions & { readonly validate: false },
): Promise<number>;
export async function writeRecords(
  records: RecordSource<unknown>,
  sink: LineSink,
  options: SerializeRecordOptions = {},
): Promise<number> {
  if (typeof sink?.write !== "function") {
    throw new TypeError("sink must have a write(chunk) method");
  }
  let count = 0;
  for await (const line of lines(records, checkSerializeOptions(options))) {
    await sink.write(line);
    count += 1;
  }
  return count;
}
