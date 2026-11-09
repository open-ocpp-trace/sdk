import { describe, expect, it } from "vite-plus/test";

import { TraceValidationError } from "@open-ocpp-trace/core";

import { JsonlWriteError, serializeRecord } from "../../src/writer/index.ts";
import { callError, callResult, fullCall } from "../../../core/test/support/records.ts";
import { untyped } from "./untyped.ts";

function caught(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("serializeRecord", () => {
  it.each([
    ["CALL", fullCall()],
    ["CALLRESULT", callResult()],
    ["CALLERROR", callError()],
  ])("writes a %s as JSON.stringify output plus one LF", (_, record) => {
    const line = serializeRecord(untyped(record));
    expect(line).toBe(`${JSON.stringify(record)}\n`);
    expect(line.indexOf("\n")).toBe(line.length - 1);
    expect(JSON.parse(line)).toStrictEqual(record);
  });

  it("keeps key order, unknown fields, meta and raw as given", () => {
    const record = {
      vendorField: { b: 2, a: 1 },
      ...callResult(),
      meta: { z: true, a: [1, "x"] },
      raw: '[3,"msg-1",{}]',
    };
    const line = serializeRecord(untyped(record));
    expect(line).toBe(`${JSON.stringify(record)}\n`);
    expect(Object.keys(JSON.parse(line) as object)).toEqual(Object.keys(record));
  });

  it("escapes characters that would break the line framing", () => {
    const lone = String.fromCharCode(0xd800);
    const record = { ...callResult(), payload: { text: `a\nb\rc${lone}` } };
    const line = serializeRecord(untyped(record));
    expect(line.slice(0, -1)).not.toMatch(/[\n\r]/);
    expect(line).toContain("\\ud800");
  });

  describe("with validation (default)", () => {
    it("throws a validation JsonlWriteError wrapping the core issues", () => {
      const record = { ...callResult(), messageType: "NOPE" };
      const error = caught(() => serializeRecord(untyped(record)));
      expect(error).toBeInstanceOf(JsonlWriteError);
      const writeError = error as JsonlWriteError;
      expect(writeError.kind).toBe("validation");
      expect(writeError.index).toBeUndefined();
      expect(writeError.issues.length).toBeGreaterThan(0);
      expect(writeError.issues[0]?.path).toBe("/messageType");
      expect(writeError.cause).toBeInstanceOf(TraceValidationError);
      expect(writeError.message).toContain("/messageType");
    });

    it("rejects a non-object record", () => {
      const error = caught(() => serializeRecord(untyped("not a record")));
      expect(error).toMatchObject({ name: "JsonlWriteError", kind: "validation" });
    });

    describe("a valid record with a top-level toJSON", () => {
      const overrides = [
        ["a string", () => "x"],
        ["undefined", () => undefined],
        ["an empty object", () => ({})],
      ] as const;

      it.each(overrides)("throws to-json for a toJSON returning %s", (_, toJSON) => {
        const error = caught(() => serializeRecord(untyped({ ...callResult(), toJSON })));
        expect(error).toBeInstanceOf(JsonlWriteError);
        expect(error).toMatchObject({ kind: "to-json", issues: [] });
        expect((error as JsonlWriteError).message).toContain("toJSON");
      });

      it("throws to-json for an inherited toJSON", () => {
        const record: unknown = Object.assign(
          Object.create({ toJSON: () => ({}) }) as object,
          callResult(),
        );
        const error = caught(() => serializeRecord(untyped(record)));
        expect(error).toMatchObject({ name: "JsonlWriteError", kind: "to-json" });
      });

      it("reports core's issues first for an invalid record", () => {
        const record = { ...callResult(), direction: "sideways", toJSON: () => ({}) };
        const error = caught(() => serializeRecord(untyped(record)));
        expect(error).toMatchObject({ kind: "validation" });
      });

      it("maps a throwing toJSON getter to unserializable", () => {
        const cause = new Error("getter");
        const record = Object.defineProperty(callResult(), "toJSON", {
          get: () => {
            throw cause;
          },
        });
        const error = caught(() => serializeRecord(untyped(record)));
        expect(error).toMatchObject({ kind: "unserializable" });
        expect((error as JsonlWriteError).cause).toBe(cause);
      });

      it("writes the toJSON result as before with validate: false", () => {
        const record = (toJSON: () => unknown): unknown => ({ ...callResult(), toJSON });
        expect(
          caught(() =>
            serializeRecord(
              record(() => "x"),
              { validate: false },
            ),
          ),
        ).toMatchObject({ kind: "not-an-object" });
        expect(
          caught(() =>
            serializeRecord(
              record(() => undefined),
              { validate: false },
            ),
          ),
        ).toMatchObject({ kind: "no-output" });
        expect(
          serializeRecord(
            record(() => ({})),
            { validate: false },
          ),
        ).toBe("{}\n");
      });
    });

    it("validates by default and when validate is true", () => {
      const record = { ...callResult(), timestamp: "yesterday" };
      expect(() => serializeRecord(untyped(record))).toThrow(JsonlWriteError);
      expect(() => serializeRecord(untyped(record), { validate: true })).toThrow(JsonlWriteError);
    });
  });

  describe("without validation", () => {
    it("writes an invalid but serialisable record unchanged", () => {
      const record = { messageType: "NOPE", extra: 1 };
      expect(serializeRecord(record, { validate: false })).toBe(`${JSON.stringify(record)}\n`);
    });

    it.each([
      ["undefined", undefined],
      ["a function", () => 1],
      ["a symbol", Symbol("x")],
    ])("throws no-output for %s, which JSON.stringify drops", (_, value) => {
      const error = caught(() => serializeRecord(value, { validate: false }));
      expect(error).toMatchObject({ name: "JsonlWriteError", kind: "no-output" });
    });

    it.each([
      ["a string", "x"],
      ["null", null],
      ["an array", [1]],
      ["a number", 1],
      ["an object whose toJSON returns a string", { toJSON: () => "x" }],
    ])("throws not-an-object for %s", (_, value) => {
      const error = caught(() => serializeRecord(value, { validate: false }));
      expect(error).toMatchObject({ name: "JsonlWriteError", kind: "not-an-object" });
    });
  });

  describe("unserialisable values", () => {
    const circular = (): Record<string, unknown> => {
      const payload: Record<string, unknown> = {};
      payload["self"] = payload;
      return { ...callResult(), payload };
    };
    const bigint = (): Record<string, unknown> => ({ ...callResult(), payload: { n: 1n } });
    const throwingToJSON = (cause: Error): Record<string, unknown> => ({
      ...callResult(),
      payload: {
        toJSON: () => {
          throw cause;
        },
      },
    });

    it.each([
      ["a circular payload", circular],
      ["a BigInt in the payload", bigint],
    ])("throws unserializable for %s, validated or not", (_, make) => {
      for (const validate of [true, false]) {
        const error = caught(() => serializeRecord(untyped(make()), { validate }));
        expect(error).toMatchObject({ name: "JsonlWriteError", kind: "unserializable" });
        expect((error as JsonlWriteError).cause).toBeInstanceOf(TypeError);
      }
    });

    it("throws unserializable for a circular record at the top level", () => {
      const record: Record<string, unknown> = { a: 1 };
      record["self"] = record;
      const error = caught(() => serializeRecord(record, { validate: false }));
      expect(error).toMatchObject({ kind: "unserializable" });
    });

    it("keeps the error thrown by a toJSON method as the cause", () => {
      const cause = new Error("boom");
      const error = caught(() => serializeRecord(untyped(throwingToJSON(cause))));
      expect(error).toMatchObject({ kind: "unserializable" });
      expect((error as JsonlWriteError).cause).toBe(cause);
    });
  });

  it("documents the values JSON.stringify changes silently inside payload", () => {
    const record = {
      ...callResult(),
      payload: { gone: undefined, fn: () => 1, nan: Number.NaN, list: [undefined] },
    };
    expect(JSON.parse(serializeRecord(untyped(record)))).toStrictEqual({
      ...callResult(),
      payload: { nan: null, list: [null] },
    });
  });

  it("rejects a validate option that is not a boolean", () => {
    expect(() =>
      serializeRecord(untyped(callResult()), { validate: "no" as unknown as boolean }),
    ).toThrow(TypeError);
  });
});
