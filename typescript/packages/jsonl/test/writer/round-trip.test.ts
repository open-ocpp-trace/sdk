import { describe, expect, it } from "vite-plus/test";

import { readRecords } from "../../src/reader/index.ts";
import { serializeRecord, serializeRecords, writeRecords } from "../../src/writer/index.ts";
import { fixtureTraces } from "../../../core/test/support/corpus.ts";
import { callResult } from "../../../core/test/support/records.ts";
import { collect, utf8 } from "../support/chunks.ts";
import { untyped, untypedAll } from "./untyped.ts";

const traces = fixtureTraces();

describe("writer and reader round trip", () => {
  it("covers fixtures listed in the manifest", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  describe.each(traces.map((trace) => [trace.name, trace] as const))("%s", (_, trace) => {
    const records = untypedAll(trace.lines.map((line) => JSON.parse(line.text) as unknown));

    it("serialises every record as JSON.stringify output plus LF", () => {
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(serializeRecord(record)).toBe(`${JSON.stringify(record)}\n`);
      }
    });

    it("reads back the records it wrote, as text and as UTF-8 bytes", async () => {
      const lines = await collect(serializeRecords(records));
      expect(await collect(readRecords(lines))).toStrictEqual(records);
      expect(await collect(readRecords(lines.map(utf8)))).toStrictEqual(records);
    });

    it("reads back the stream written to a sink", async () => {
      const chunks: string[] = [];
      const count = await writeRecords(records, { write: (chunk) => void chunks.push(chunk) });
      expect(count).toBe(records.length);
      expect(await collect(readRecords([utf8(chunks.join(""))]))).toStrictEqual(records);
    });
  });

  // The corpus has no `meta`, offset timestamp or unknown field: cover them here.
  it("round-trips unknown fields, meta, raw and an offset timestamp", async () => {
    const record = {
      vendorExtension: { b: [1, "x"], a: null },
      ...callResult(),
      timestamp: "2025-01-15T10:00:01.5+01:00",
      meta: { producer: "test", nested: { deep: true } },
      raw: '[3,"msg-1",{}]',
    };
    const [read] = await collect(readRecords([utf8(serializeRecord(untyped(record)))]));
    expect(read).toStrictEqual(record);
    expect(Object.keys(read ?? {})).toEqual(Object.keys(record));
  });

  it("round-trips non-ASCII text, a lone surrogate and U+2028", async () => {
    const text = `été 😀 ${String.fromCharCode(0xd800)} ${String.fromCharCode(0x2028)}`;
    const record = { ...callResult(), payload: { text } };
    const [read] = await collect(readRecords([utf8(serializeRecord(untyped(record)))]));
    expect(read).toStrictEqual(record);
  });
});
