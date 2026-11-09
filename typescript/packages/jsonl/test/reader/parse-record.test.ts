import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { TraceRecord } from "@open-ocpp-trace/core";

import { JsonlReadError } from "../../src/reader/errors.ts";
import { parseRecord, type ReadResult } from "../../src/reader/parse.ts";

const CALL = {
  schemaVersion: "1.1",
  timestamp: "2025-01-15T10:00:00.123456789+02:00",
  transport: "json",
  direction: "cp-to-csms",
  messageType: "CALL",
  messageId: "0001-é",
  action: "Heartbeat",
  payload: {},
};

describe("parseRecord", () => {
  it("returns the validated record with its line number", () => {
    const result = parseRecord(JSON.stringify(CALL), { line: 7 });
    expect(result).toEqual({ ok: true, record: CALL, line: 7 });
    expectTypeOf(result).toEqualTypeOf<ReadResult>();
  });

  it("numbers the line 1 by default", () => {
    expect(parseRecord(JSON.stringify(CALL))).toMatchObject({ ok: true, line: 1 });
  });

  it("preserves raw, timestamps, identifiers and unknown fields as written", () => {
    // The OCPP frame as received, JSON escapes included (backslash-u00e9, backslash-n).
    const bs = "\\";
    const raw = `[2,"0001-é","Heartbeat",{"x":"a${bs}u00e9${bs}n"}]`;
    const line = String.raw`{"schemaVersion":"1.7","timestamp":"2025-01-15T10:00:00.123456789+02:00","transport":"json","direction":"cp-to-csms","messageType":"CALL","messageId":"0001-é","action":"Heartbeat","raw":"[2,\"0001-é\",\"Heartbeat\",{\"x\":\"a\\u00e9\\n\"}]","meta":{"vendor":{"k":[1,2]}},"x-extension":{"n":null}}`;
    const result = parseRecord(line);
    if (!result.ok) throw result.error;
    const record = result.record as TraceRecord & Record<string, unknown>;
    expect(record.raw).toBe(raw);
    expect(record.timestamp).toBe("2025-01-15T10:00:00.123456789+02:00");
    expect(record.schemaVersion).toBe("1.7");
    expect(record.messageId).toBe("0001-é");
    expect(record.meta).toEqual({ vendor: { k: [1, 2] } });
    expect(record["x-extension"]).toEqual({ n: null });
    expect(JSON.stringify(record)).toBe(line);
  });

  it("reports invalid JSON with the line and the parser error as cause", () => {
    const result = parseRecord('{"schemaVersion":', { line: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(JsonlReadError);
    expect(result.error).toMatchObject({ line: 3, kind: "json", issues: [] });
    expect(result.error.cause).toBeInstanceOf(SyntaxError);
    expect(result.error.message).toMatch(/^Line 3: invalid JSON: /);
  });

  it("reports a schema failure with the line and every issue", () => {
    const { action: _action, ...withoutAction } = CALL;
    const result = parseRecord(JSON.stringify({ ...withoutAction, transport: "ws" }), { line: 4 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ line: 4, kind: "validation" });
    expect(result.error.issues.map((issue) => [issue.path, issue.code])).toEqual(
      expect.arrayContaining([
        ["/transport", "enum"],
        ["/action", "required"],
      ]),
    );
    expect(result.error.message).toMatch(/^Line 4: invalid trace record: /);
    expect(result.error.message).toContain("/transport");
  });

  it("reports valid JSON that is not an object as a validation error", () => {
    for (const line of ["[]", "null", "42", '"text"']) {
      const result = parseRecord(line);
      expect(result.ok === false && result.error.kind).toBe("validation");
    }
  });

  it("rejects a line number that is not a positive integer", () => {
    expect(() => parseRecord("{}", { line: 0 })).toThrow(RangeError);
  });
});
