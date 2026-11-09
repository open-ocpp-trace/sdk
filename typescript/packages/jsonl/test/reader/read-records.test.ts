import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { TraceRecord } from "@open-ocpp-trace/core";

import { JsonlReadError, readRecords, type ReadResult } from "../../src/reader/index.ts";
import { BOM, chunksOf, concat, randomChunks, seededRandom, utf8 } from "../support/chunks.ts";

const call = (id: string) => ({
  schemaVersion: "1.1",
  timestamp: "2025-01-15T10:00:00.000Z",
  transport: "json",
  direction: "cp-to-csms",
  messageType: "CALL",
  messageId: id,
  action: "Heartbeat",
  payload: {},
  raw: `[2,"${id}","Heartbeat",{}]`,
});
const result = (id: string) => ({
  schemaVersion: "1.1",
  timestamp: "2025-01-15T10:00:01+01:00",
  transport: "json",
  direction: "csms-to-cp",
  messageType: "CALLRESULT",
  messageId: id,
  payload: { currentTime: "2025-01-15T09:00:01Z", note: "été 😀" },
  meta: { vendor: { x: 1 } },
});

const RECORDS = [call("1"), result("1"), call("2"), result("2")];
const STREAM = `${BOM}${RECORDS.map((r) => JSON.stringify(r)).join("\r\n")}`;

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

async function* asAsync<T>(items: Iterable<T>): AsyncGenerator<T> {
  for (const item of items) yield item;
}

describe("readRecords in throw mode (default)", () => {
  it("reads every record from text, bytes, sync and async sources", async () => {
    const bytes = utf8(STREAM);
    const sources: (Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>)[] = [
      [STREAM],
      [bytes],
      chunksOf(bytes, 1),
      chunksOf(STREAM, 1),
      asAsync(chunksOf(bytes, 5)),
      asAsync(randomChunks(bytes, seededRandom(3), 40)),
    ];
    for (const source of sources) {
      expect(await collect(readRecords(source))).toEqual(RECORDS);
    }
  });

  it("reads the same records for many random chunkings", async () => {
    const bytes = utf8(`${STREAM}\n\n`);
    const random = seededRandom(11);
    for (let round = 0; round < 100; round += 1) {
      expect(await collect(readRecords(randomChunks(bytes, random, 64)))).toEqual(RECORDS);
    }
  });

  it("is typed as an iterable of records", () => {
    expectTypeOf(readRecords([])).toEqualTypeOf<AsyncIterable<TraceRecord>>();
    expectTypeOf(readRecords([], { onError: "throw" })).toEqualTypeOf<AsyncIterable<TraceRecord>>();
  });

  it("throws the first error with its line, after the records before it", async () => {
    const input = `${JSON.stringify(call("1"))}\n\n{oops}\n${JSON.stringify(call("2"))}\n`;
    const seen: TraceRecord[] = [];
    const error = await (async () => {
      try {
        for await (const record of readRecords([input])) seen.push(record);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(seen).toEqual([call("1")]);
    expect(error).toBeInstanceOf(JsonlReadError);
    expect(error).toMatchObject({ line: 3, kind: "json" });
  });

  it("propagates an error thrown by the source", async () => {
    async function* failing(): AsyncGenerator<string> {
      yield `${JSON.stringify(call("1"))}\n`;
      throw new Error("disk on fire");
    }
    await expect(collect(readRecords(failing()))).rejects.toThrow("disk on fire");
  });

  it("validates options when called, not when iterated", () => {
    expect(() => readRecords([], { maxLineBytes: 0 })).toThrow(RangeError);
    expect(() => readRecords([], { onError: "skip" as "yield" })).toThrow(RangeError);
  });
});

describe("readRecords in yield mode", () => {
  const BAD_UTF8 = concat(utf8('{"a":"'), new Uint8Array([0xc3, 0x28]), utf8('"}'));

  it("yields an item per line and continues after every kind of error", async () => {
    const { action: _action, ...invalid } = call("x");
    const input = concat(
      utf8(`${JSON.stringify(call("1"))}\n`),
      utf8("{oops}\n"),
      utf8(`${JSON.stringify(invalid)}\r\n`),
      BAD_UTF8,
      utf8("\n"),
      utf8(`{"pad":"${"x".repeat(600)}"}\n`),
      utf8("\n"),
      utf8(`${JSON.stringify(result("1"))}`),
    );
    for (const chunks of [[input], chunksOf(input, 1), chunksOf(input, 7)]) {
      const items = await collect(readRecords(chunks, { onError: "yield", maxLineBytes: 400 }));
      expect(
        items.map((item) => (item.ok ? ["ok", item.line] : [item.error.kind, item.error.line])),
      ).toEqual([
        ["ok", 1],
        ["json", 2],
        ["validation", 3],
        ["encoding", 4],
        ["line-too-long", 5],
        ["ok", 7],
      ]);
      expect(items[0]).toEqual({ ok: true, record: call("1"), line: 1 });
      expect(items[5]).toEqual({ ok: true, record: result("1"), line: 7 });
      const validation = items[2];
      expect(validation?.ok === false && validation.error.issues).toEqual([
        expect.objectContaining({ path: "/action", code: "required" }),
      ]);
    }
  });

  it("is typed as an iterable of results", () => {
    expectTypeOf(readRecords([], { onError: "yield" })).toEqualTypeOf<AsyncIterable<ReadResult>>();
    const mode = "yield" as "throw" | "yield";
    expectTypeOf(readRecords([], { onError: mode })).toEqualTypeOf<
      AsyncIterable<TraceRecord | ReadResult>
    >();
  });

  it("still throws a TypeError for a stream mixing strings and bytes", async () => {
    await expect(collect(readRecords(["{}\n", utf8("{}")], { onError: "yield" }))).rejects.toThrow(
      TypeError,
    );
  });
});

describe("readRecords memory bound", () => {
  const LIMIT = 64 * 1024;
  const PIECE = 1024;
  // Enough to fill the limit plus the chunk that crosses it.
  const MAX_PULLS = Math.ceil(LIMIT / PIECE) + 1;

  /**
   * A source that yields one valid record, then a line 1000 times the limit
   * in 1 KiB pieces, then a valid record. `pulls` counts the pieces of the
   * huge line handed to the reader so far.
   */
  function hugeLineSource(asBytes: boolean) {
    const counter = { pulls: 0 };
    const piece = asBytes ? utf8("x".repeat(PIECE)) : "x".repeat(PIECE);
    const head = `${JSON.stringify(call("1"))}\n`;
    const tail = `\n${JSON.stringify(call("2"))}\n`;
    async function* source(): AsyncGenerator<string | Uint8Array> {
      yield asBytes ? utf8(head) : head;
      for (let index = 0; index < (1000 * LIMIT) / PIECE; index += 1) {
        counter.pulls += 1;
        yield piece;
      }
      yield asBytes ? utf8(tail) : tail;
    }
    return { counter, source: source() };
  }

  for (const asBytes of [false, true]) {
    const kind = asBytes ? "bytes" : "text";

    it(`fails fast in throw mode without reading the rest of the line (${kind})`, async () => {
      const { counter, source } = hugeLineSource(asBytes);
      const seen: TraceRecord[] = [];
      await expect(
        (async () => {
          for await (const record of readRecords(source, { maxLineBytes: LIMIT })) {
            seen.push(record);
          }
        })(),
      ).rejects.toMatchObject({ line: 2, kind: "line-too-long" });
      expect(seen).toEqual([call("1")]);
      expect(counter.pulls).toBeLessThanOrEqual(MAX_PULLS);
    });

    it(`reports the line as soon as it is too long in yield mode, then resumes (${kind})`, async () => {
      const { counter, source } = hugeLineSource(asBytes);
      const pullsAtItem: number[] = [];
      const items: ReadResult[] = [];
      for await (const item of readRecords(source, { maxLineBytes: LIMIT, onError: "yield" })) {
        pullsAtItem.push(counter.pulls);
        items.push(item);
      }
      expect(items.map((item) => (item.ok ? item.line : item.error.kind))).toEqual([
        1,
        "line-too-long",
        3,
      ]);
      expect(pullsAtItem[1]).toBeLessThanOrEqual(MAX_PULLS);
      expect(counter.pulls).toBe((1000 * LIMIT) / PIECE);
    });
  }
});
