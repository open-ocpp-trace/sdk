import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type {
  CallErrorRecord,
  CallRecord,
  CallResultRecord,
  Direction,
  MessageType,
  TraceError,
  TraceRecord,
  Transport,
} from "../src/index.ts";

const base = {
  schemaVersion: "1.1",
  timestamp: "2025-01-15T10:30:00Z",
  transport: "json",
  direction: "cp-to-csms",
} as const;

// These declarations are checked by `vp check`; each `@ts-expect-error` fails
// the check if the model stops rejecting the record below it.
const call: TraceRecord = { ...base, messageType: "CALL", action: "Heartbeat" };
const result: TraceRecord = { ...base, messageType: "CALLRESULT", payload: {} };
const failure: TraceRecord = { ...base, messageType: "CALLERROR", error: { code: "X" } };

// @ts-expect-error a CALL needs an action
const callWithoutAction: TraceRecord = { ...base, messageType: "CALL" };
// @ts-expect-error a CALLERROR needs an error
const errorWithoutError: TraceRecord = { ...base, messageType: "CALLERROR" };
// @ts-expect-error only a CALLERROR carries an error
const resultWithError: TraceRecord = { ...base, messageType: "CALLRESULT", error: { code: "X" } };
// @ts-expect-error transport is limited to the schema values
const badTransport: TraceRecord = { ...base, transport: "http", messageType: "CALLRESULT" };

describe("TraceRecord type", () => {
  it("is a union discriminated by messageType", () => {
    expectTypeOf<TraceRecord>().toEqualTypeOf<CallRecord | CallResultRecord | CallErrorRecord>();
    expectTypeOf<TraceRecord["messageType"]>().toEqualTypeOf<MessageType>();
    expectTypeOf<Transport>().toEqualTypeOf<"json" | "soap">();
    expectTypeOf<Direction>().toEqualTypeOf<"cp-to-csms" | "csms-to-cp">();
    expectTypeOf<MessageType>().toEqualTypeOf<"CALL" | "CALLRESULT" | "CALLERROR">();
  });

  it("narrows on messageType", () => {
    const record = failure as TraceRecord;
    if (record.messageType === "CALLERROR") expectTypeOf(record.error).toEqualTypeOf<TraceError>();
    if (record.messageType === "CALL") expectTypeOf(record.action).toEqualTypeOf<string>();
    expectTypeOf(record.action).toEqualTypeOf<string | undefined>();
    expectTypeOf(record.payload).toEqualTypeOf<unknown>();
    expectTypeOf(record.meta).toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it("keeps the declarations above alive", () => {
    const records = [call, result, failure, callWithoutAction, errorWithoutError];
    expect([...records, resultWithError, badTransport]).toHaveLength(7);
  });
});
