// A large synthetic stream through the whole pipeline: a lazy record
// generator, `serializeRecords`, re-chunking into fixed-size UTF-8 byte
// chunks that cut lines and multibyte characters anywhere, and
// `readRecords`. Checks that nothing is lost and that the pipeline
// streams: the generator never runs more than a few chunks ahead of the
// consumer, so the input is never buffered whole.

import { describe, expect, it } from "vite-plus/test";

import { BASE_FIELDS } from "../../core/test/support/records.ts";
import { readRecords } from "../src/reader/index.ts";
import { serializeRecord, serializeRecords } from "../src/writer/index.ts";
import { concat, utf8 } from "./support/chunks.ts";

const RECORD_COUNT = 100_000;
const CHUNK_BYTES = 4096;
const MAX_LINE_BYTES = 1024;

/** The `index`-th record; its text is non-ASCII so that chunks split characters. */
function syntheticRecord(index: number): Record<string, unknown> {
  const id = `msg-${index}`;
  return index % 2 === 0
    ? {
        ...BASE_FIELDS,
        messageType: "CALL",
        messageId: id,
        action: "DataTransfer",
        payload: { vendorId: "été", data: `n°${index} 😀 中文` },
        raw: `[2,"${id}","DataTransfer",{"vendorId":"été","data":"n°${index} 😀 中文"}]`,
      }
    : {
        ...BASE_FIELDS,
        direction: "csms-to-cp",
        messageType: "CALLRESULT",
        messageId: id,
        payload: { status: "Accepted" },
      };
}

/** FNV-1a over the identifiers, in order. */
function checksum(previous: number, messageId: unknown): number {
  let hash = previous;
  for (const char of String(messageId)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
const FNV_OFFSET = 0x811c9dc5;

/** Generates the records lazily, counting how many have been pulled. */
function* generate(state: { produced: number; checksum: number }): Generator<unknown> {
  for (let index = 0; index < RECORD_COUNT; index += 1) {
    const record = syntheticRecord(index);
    state.produced += 1;
    state.checksum = checksum(state.checksum, record.messageId);
    yield record;
  }
}

/** Re-chunks lines into UTF-8 chunks of exactly `size` bytes (the last may be shorter). */
async function* rechunk(lines: AsyncIterable<string>, size: number): AsyncGenerator<Uint8Array> {
  let pending: Uint8Array = new Uint8Array(0);
  for await (const line of lines) {
    pending = concat(pending, utf8(line));
    while (pending.length >= size) {
      yield pending.slice(0, size);
      pending = pending.slice(size);
    }
  }
  if (pending.length > 0) yield pending;
}

describe("large synthetic stream", () => {
  it(`writes and reads ${RECORD_COUNT} records lazily, in ${CHUNK_BYTES}-byte chunks`, async () => {
    const produced = { produced: 0, checksum: FNV_OFFSET };
    let consumed = 0;
    let consumedChecksum = FNV_OFFSET;
    let maxAhead = 0;

    const chunks = rechunk(serializeRecords(generate(produced)), CHUNK_BYTES);
    for await (const record of readRecords(chunks, { maxLineBytes: MAX_LINE_BYTES })) {
      consumed += 1;
      consumedChecksum = checksum(consumedChecksum, record.messageId);
      maxAhead = Math.max(maxAhead, produced.produced - consumed);
    }

    expect(consumed).toBe(RECORD_COUNT);
    expect(produced.produced).toBe(RECORD_COUNT);
    expect(consumedChecksum).toBe(produced.checksum);

    // One chunk holds at most CHUNK_BYTES / shortest line records, plus
    // the lines it cuts at either end; the generator may be one record
    // ahead of the chunk being filled.
    const shortestLine = Math.min(
      utf8(serializeRecord(syntheticRecord(0))).length,
      utf8(serializeRecord(syntheticRecord(1))).length,
    );
    expect(maxAhead).toBeGreaterThan(0);
    expect(maxAhead).toBeLessThanOrEqual(Math.ceil(CHUNK_BYTES / shortestLine) + 3);
  }, 10_000);
});
