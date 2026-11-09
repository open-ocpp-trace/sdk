import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { TraceRecord } from "@open-ocpp-trace/core";

import { readRecords } from "../../src/reader/index.ts";
import {
  serializeRecord,
  serializeRecords,
  writeRecords,
  type RecordSource,
} from "../../src/writer/index.ts";
import { callResult } from "../../../core/test/support/records.ts";
import { untyped } from "./untyped.ts";

// These calls are checked by `vp check` and never run; each
// `@ts-expect-error` fails the check if the call below it compiles.
export function compileTimeChecks(flag: boolean): void {
  const sink = { write: (_chunk: string): void => undefined };

  // @ts-expect-error validation is on by default: the record must be typed
  serializeRecord({});
  // @ts-expect-error validation is on: the record must be typed
  serializeRecord({}, { validate: true });
  // @ts-expect-error validation may be on: the record must be typed
  serializeRecord({}, { validate: flag });
  serializeRecord({}, { validate: false });

  // @ts-expect-error validation is on by default: the records must be typed
  void serializeRecords([{}]);
  void serializeRecords([{}], { validate: false });

  // @ts-expect-error validation is on by default: the records must be typed
  void writeRecords([{}], sink);
  void writeRecords([{}], sink, { validate: false });
}

describe("writer input types", () => {
  it("takes a TraceRecord by default and unknown without validation", () => {
    expectTypeOf(serializeRecord).toBeCallableWith(untyped(callResult()));
    expectTypeOf(serializeRecord).toBeCallableWith({} as unknown, { validate: false });
    expectTypeOf<RecordSource>().toEqualTypeOf<
      AsyncIterable<TraceRecord> | Iterable<TraceRecord>
    >();
    expectTypeOf<RecordSource<unknown>>().toEqualTypeOf<
      AsyncIterable<unknown> | Iterable<unknown>
    >();
  });

  it("writes the reader's output without a cast", async () => {
    const records = readRecords([JSON.stringify(callResult()), "\n"]);
    expectTypeOf(records).toEqualTypeOf<AsyncIterable<TraceRecord>>();
    const chunks: string[] = [];
    await expect(
      writeRecords(records, { write: (chunk) => void chunks.push(chunk) }),
    ).resolves.toBe(1);
    expect(chunks).toEqual([`${JSON.stringify(callResult())}\n`]);
  });
});
