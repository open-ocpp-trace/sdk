import { describe, expect, it } from "vite-plus/test";

import type { TraceRecord } from "@open-ocpp-trace/core";

import { JsonlWriteError, serializeRecords, writeRecords } from "../../src/writer/index.ts";
import { callError, callResult, fullCall } from "../../../core/test/support/records.ts";
import { collect } from "../support/chunks.ts";
import { untyped, untypedAll } from "./untyped.ts";

const RECORDS = untypedAll([fullCall(), callResult(), callError()]);
const INVALID = untyped({ ...callResult(), direction: "sideways" });

async function* asyncOf<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

/** A sink that stores every chunk. */
function memorySink(): { chunks: string[]; write(chunk: string): void } {
  const chunks: string[] = [];
  return { chunks, write: (chunk) => void chunks.push(chunk) };
}

describe("serializeRecords", () => {
  it.each([
    ["an iterable", () => RECORDS],
    ["an async iterable", () => asyncOf(RECORDS)],
  ])("yields one line per record from %s", async (_, source) => {
    const lines = await collect(serializeRecords(source()));
    expect(lines).toEqual(RECORDS.map((record) => `${JSON.stringify(record)}\n`));
  });

  it("yields nothing for an empty input", async () => {
    expect(await collect(serializeRecords([]))).toEqual([]);
  });

  it("stops at the first error and reports its 0-based index", async () => {
    const lines: string[] = [];
    let error: unknown;
    try {
      for await (const line of serializeRecords([
        RECORDS[0] as TraceRecord,
        INVALID,
        RECORDS[1] as TraceRecord,
      ])) {
        lines.push(line);
      }
    } catch (caught) {
      error = caught;
    }
    expect(lines).toHaveLength(1);
    expect(error).toBeInstanceOf(JsonlWriteError);
    expect(error).toMatchObject({ kind: "validation", index: 1 });
    expect((error as JsonlWriteError).issues[0]?.path).toBe("/direction");
    expect((error as JsonlWriteError).message).toMatch(/^Record 1: /);
  });

  it("carries the index of an unserialisable record", async () => {
    const records = untypedAll([
      callResult(),
      callResult(),
      { ...callResult(), payload: { n: 2n } },
    ]);
    await expect(collect(serializeRecords(records))).rejects.toMatchObject({
      kind: "unserializable",
      index: 2,
    });
  });

  it("passes the validate option on", async () => {
    const lines = await collect(serializeRecords([INVALID], { validate: false }));
    expect(lines).toEqual([`${JSON.stringify(INVALID)}\n`]);
  });

  it("lets an error of the source propagate unchanged", async () => {
    const failure = new Error("source failed");
    async function* failing(): AsyncGenerator<TraceRecord> {
      yield untyped(callResult());
      throw failure;
    }
    await expect(collect(serializeRecords(failing()))).rejects.toBe(failure);
  });

  it("checks the options when called", () => {
    expect(() => serializeRecords([], { validate: 1 as unknown as boolean })).toThrow(TypeError);
  });
});

describe("writeRecords", () => {
  it("writes every line and resolves with the count", async () => {
    const sink = memorySink();
    await expect(writeRecords(asyncOf(RECORDS), sink)).resolves.toBe(3);
    expect(sink.chunks).toEqual(RECORDS.map((record) => `${JSON.stringify(record)}\n`));
  });

  it("writes nothing for an empty input", async () => {
    const sink = memorySink();
    await expect(writeRecords([], sink)).resolves.toBe(0);
    expect(sink.chunks).toEqual([]);
  });

  it("awaits each write before pulling the next record", async () => {
    const log: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    function* source(): Generator<TraceRecord> {
      for (const [index, record] of RECORDS.entries()) {
        log.push(`pull ${index}`);
        yield record;
      }
    }
    const sink = {
      async write(chunk: string): Promise<void> {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const id = (JSON.parse(chunk) as { messageType: string }).messageType;
        log.push(`start ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`end ${id}`);
        inFlight -= 1;
      },
    };
    await expect(writeRecords(source(), sink)).resolves.toBe(3);
    expect(maxInFlight).toBe(1);
    expect(log).toEqual([
      "pull 0",
      "start CALL",
      "end CALL",
      "pull 1",
      "start CALLRESULT",
      "end CALLRESULT",
      "pull 2",
      "start CALLERROR",
      "end CALLERROR",
    ]);
  });

  it("propagates a sink rejection unchanged and stops writing", async () => {
    const failure = new Error("disk full");
    let calls = 0;
    const sink = {
      write: async (): Promise<void> => {
        calls += 1;
        if (calls === 2) throw failure;
      },
    };
    await expect(writeRecords(RECORDS, sink)).rejects.toBe(failure);
    expect(calls).toBe(2);
  });

  it("propagates a synchronous sink throw unchanged", async () => {
    const failure = new Error("closed");
    const sink = {
      write: (): void => {
        throw failure;
      },
    };
    await expect(writeRecords(RECORDS, sink)).rejects.toBe(failure);
  });

  it("rejects with the record index and keeps the lines written before it", async () => {
    const sink = memorySink();
    await expect(writeRecords([RECORDS[0] as TraceRecord, INVALID], sink)).rejects.toMatchObject({
      name: "JsonlWriteError",
      kind: "validation",
      index: 1,
    });
    expect(sink.chunks).toEqual([`${JSON.stringify(fullCall())}\n`]);
  });

  it("passes the validate option on", async () => {
    const sink = memorySink();
    await expect(writeRecords([INVALID], sink, { validate: false })).resolves.toBe(1);
  });

  describe("closes the source once", () => {
    /** A sync source over `items` that counts its `return()` calls. */
    function syncSource(
      items: readonly TraceRecord[],
    ): Iterable<TraceRecord> & { returns: number } {
      const source = {
        returns: 0,
        [Symbol.iterator]: (): Iterator<TraceRecord> => {
          let next = 0;
          return {
            next: (): IteratorResult<TraceRecord> =>
              next < items.length
                ? { done: false, value: items[next++] as TraceRecord }
                : { done: true, value: undefined },
            return: (): IteratorResult<TraceRecord> => {
              source.returns += 1;
              return { done: true, value: undefined };
            },
          };
        },
      };
      return source;
    }

    /** An async source over `items` that counts its `return()` calls. */
    function asyncSource(
      items: readonly TraceRecord[],
    ): AsyncIterable<TraceRecord> & { readonly returns: number } {
      const sync = syncSource(items);
      return {
        get returns(): number {
          return sync.returns;
        },
        [Symbol.asyncIterator]: (): AsyncIterator<TraceRecord> => {
          const iterator = sync[Symbol.iterator]();
          return {
            next: async () => iterator.next(),
            return: async () => iterator.return?.() ?? { done: true, value: undefined },
          };
        },
      };
    }

    const sources = [
      ["a sync source", syncSource],
      ["an async source", asyncSource],
    ] as const;

    it.each(sources)("when the sink rejects, from %s", async (_, make) => {
      const source = make(RECORDS);
      const failure = new Error("disk full");
      const sink = { write: (): Promise<void> => Promise.reject(failure) };
      await expect(writeRecords(source, sink)).rejects.toBe(failure);
      expect(source.returns).toBe(1);
    });

    it.each(sources)("when a record is invalid, from %s", async (_, make) => {
      const source = make([...RECORDS.slice(0, 1), INVALID, ...RECORDS.slice(1)]);
      await expect(writeRecords(source, memorySink())).rejects.toMatchObject({
        kind: "validation",
        index: 1,
      });
      expect(source.returns).toBe(1);
    });
  });

  it("rejects a sink without a write method", async () => {
    await expect(writeRecords([], {} as unknown as { write(chunk: string): void })).rejects.toThrow(
      TypeError,
    );
  });
});
