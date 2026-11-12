// Cross-check of the hand-written validator against the pinned JSON Schema.
//
// For every input, `validateRecord` must accept exactly what a JSON Schema
// validator accepts, restricted to the schema versions this package reads:
//
//   validateRecord(x).ok === (ajv(x) && isSupportedSchemaVersion(x.schemaVersion))
//
// Only the verdicts are compared, never the issue lists: the validator skips
// the per-message-type rules when `messageType` is invalid, so it may report
// fewer issues than Ajv for the same invalid record.

import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  DIRECTIONS,
  isSupportedSchemaVersion,
  MESSAGE_TYPES,
  TRANSPORTS,
  validateRecord,
  type CallErrorRecord,
  type CallRecord,
  type CallResultRecord,
  type TraceError,
  type TraceRecord,
} from "../src/index.ts";
import { fixtureTraces, readSchema } from "./support/corpus.ts";
import { callError, callResult, fullCall } from "./support/records.ts";

const schema = readSchema();
// Default options (strict mode) and ajv-formats in its default "full" mode.
const ajv = new Ajv2020();
addFormats(ajv);
const ajvValidate = ajv.compile(schema);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The verdict `validateRecord` must give, according to the schema. */
function expected(input: unknown): boolean {
  return ajvValidate(input) && isObject(input) && isSupportedSchemaVersion(input["schemaVersion"]);
}

type Case = readonly [label: string, input: unknown];

function without(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...record };
  delete copy[field];
  return copy;
}

function patched(record: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...record, ...patch };
}

const BASES = {
  CALL: fullCall,
  CALLRESULT: callResult,
  CALLERROR: callError,
} as const;

const REQUIRED = ["schemaVersion", "timestamp", "transport", "direction", "messageType"] as const;
const STRING_FIELDS = ["ocppVersion", "chargePointId", "messageId", "action", "raw"] as const;
const NON_STRINGS: readonly unknown[] = [1, null, true, {}, []];

const TIMESTAMPS: readonly string[] = [
  // Accepted, strict RFC 3339.
  "2025-01-15T10:30:00Z",
  "2025-01-15T10:30:00.123456789Z",
  "2025-01-15T10:30:00+01:00",
  "2025-01-15T10:30:00-23:59",
  "2024-02-29T00:00:00Z",
  "2000-02-29T00:00:00Z",
  "2016-12-31T23:59:60Z",
  "2017-01-01T00:59:60+01:00",
  // Accepted by ajv-formats' full mode beyond a strict reading of RFC 3339.
  "2025-01-15t10:30:00z",
  "2025-01-15 10:30:00Z",
  "2025-01-15\t10:30:00Z",
  "2025-01-15\n10:30:00Z",
  "2025-01-15T10:30:00+0100",
  "2025-01-15T10:30:00+01",
  "0000-01-01T00:00:00Z",
  "2025-01-15T23:59:60Z",
  "2025-01-15T18:59:60-05:00",
  // A leap second with the two short offset spellings: the UTC check has to
  // read the same offset the range check accepts.
  "2017-01-01T00:59:60+0100",
  "2017-01-01T00:59:60+01",
  // The offset carries the UTC minute below zero: 00:00+00:01 is 23:59 UTC.
  "2025-01-15T00:00:60+00:01",
  // Rejected.
  "",
  "2025-01-15",
  "10:30:00Z",
  "2025-01-15T10:30:00",
  "2025-01-15T10:30Z",
  "2025-01-15T10:30:00.Z",
  "2025-01-15T10:30:00,5Z",
  "2025-1-15T10:30:00Z",
  "2025-01-15TT10:30:00Z",
  "2025-01-15T10:30:00Z ",
  " 2025-01-15T10:30:00Z",
  "2025-01-15_10:30:00Z",
  "2023-02-29T00:00:00Z",
  "1900-02-29T00:00:00Z",
  "2025-04-31T00:00:00Z",
  "2025-00-15T10:30:00Z",
  "2025-13-15T10:30:00Z",
  "2025-01-00T10:30:00Z",
  "2025-01-32T10:30:00Z",
  "2025-01-15T24:00:00Z",
  "2025-01-15T10:60:00Z",
  "2025-01-15T10:30:60Z",
  "2025-01-15T23:59:61Z",
  "2025-01-15T23:59:60+01:00",
  "2025-01-15T00:01:60+00:01",
  "2025-01-15T10:30:00+24:00",
  "2025-01-15T10:30:00+01:60",
  "2025-01-15T10:30:00+1",
  "2025-01-15T10:30:00UTC",
  "２０２５-01-15T10:30:00Z",
];

function synthetic(): Case[] {
  const cases: Case[] = [];
  for (const [type, base] of Object.entries(BASES)) {
    cases.push([`${type}: base record`, base()]);
    for (const field of REQUIRED) {
      cases.push([`${type}: ${field} removed`, without(base(), field)]);
      cases.push([`${type}: ${field} undefined`, patched(base(), { [field]: undefined })]);
      cases.push([`${type}: ${field} null`, patched(base(), { [field]: null })]);
      cases.push([`${type}: ${field} number`, patched(base(), { [field]: 1 })]);
    }
    for (const field of STRING_FIELDS) {
      for (const value of NON_STRINGS) {
        cases.push([
          `${type}: ${field} ${JSON.stringify(value)}`,
          patched(base(), { [field]: value }),
        ]);
      }
      cases.push([`${type}: ${field} undefined`, patched(base(), { [field]: undefined })]);
    }
    cases.push([`${type}: unknown top-level field`, patched(base(), { vendorField: { a: 1 } })]);
    cases.push([`${type}: payload null`, patched(base(), { payload: null })]);
    cases.push([`${type}: payload string`, patched(base(), { payload: "x" })]);
  }

  // Enums.
  const enums = { transport: TRANSPORTS, direction: DIRECTIONS, messageType: MESSAGE_TYPES };
  for (const [field, values] of Object.entries(enums)) {
    if (field !== "messageType") {
      for (const value of values) {
        cases.push([`${field} "${value}"`, patched(fullCall(), { [field]: value })]);
      }
    }
    for (const value of [
      "",
      "other",
      values[0].toUpperCase(),
      values[0].toLowerCase(),
      ` ${values[0]}`,
    ]) {
      if ((values as readonly string[]).includes(value)) continue;
      cases.push([`${field} ${JSON.stringify(value)}`, patched(fullCall(), { [field]: value })]);
    }
  }

  // schemaVersion: the version policy narrows the schema's plain string.
  for (const value of [
    "1.0",
    "1.1",
    "1.10",
    "01.1",
    "1.01",
    "1.42",
    "2.0",
    "0.9",
    "1",
    "v1.1",
    "1.1.0",
    "1.x",
    " 1.1",
    "１.1",
  ]) {
    cases.push([
      `schemaVersion ${JSON.stringify(value)}`,
      patched(fullCall(), { schemaVersion: value }),
    ]);
  }

  // connectorId.
  for (const value of [0, 1, 1e21, -0, -1, 1.5, "1", null, true, Number.NaN, Infinity, -Infinity]) {
    const label = Object.is(value, -0)
      ? "-0"
      : typeof value === "string"
        ? `"${value}"`
        : String(value);
    cases.push([`connectorId ${label}`, patched(fullCall(), { connectorId: value })]);
  }

  // Per-message-type rules.
  cases.push(["CALL: action removed", without(fullCall(), "action")]);
  cases.push(["CALL: error added", patched(fullCall(), { error: { code: "X" } })]);
  cases.push(["CALL: error null", patched(fullCall(), { error: null })]);
  cases.push(["CALL: error undefined", patched(fullCall(), { error: undefined })]);
  cases.push(["CALLRESULT: action set", patched(callResult(), { action: "Heartbeat" })]);
  cases.push(["CALLRESULT: error added", patched(callResult(), { error: { code: "X" } })]);
  cases.push(["CALLRESULT: error empty object", patched(callResult(), { error: {} })]);
  cases.push(["CALLRESULT: error undefined", patched(callResult(), { error: undefined })]);
  cases.push(["CALLERROR: error removed", without(callError(), "error")]);
  cases.push(["CALLERROR: error undefined", patched(callError(), { error: undefined })]);
  cases.push(["CALLERROR: error empty object", patched(callError(), { error: {} })]);
  cases.push([
    "CALLERROR: error extra field",
    patched(callError(), { error: { code: "X", vendor: 1 } }),
  ]);
  cases.push(["CALLERROR: action set", patched(callError(), { action: "Heartbeat" })]);
  for (const value of [null, "X", 1, [], [{ code: "X" }]]) {
    cases.push([
      `CALLERROR: error ${JSON.stringify(value)}`,
      patched(callError(), { error: value }),
    ]);
  }
  for (const field of ["code", "description"]) {
    for (const value of [1, null, {}, []]) {
      cases.push([
        `CALLERROR: error.${field} ${JSON.stringify(value)}`,
        patched(callError(), { error: { [field]: value } }),
      ]);
    }
  }
  for (const value of [null, "x", 1, [], [1]]) {
    cases.push([
      `CALLERROR: error.details ${JSON.stringify(value)}`,
      patched(callError(), { error: { details: value } }),
    ]);
  }

  // meta.
  for (const value of [{}, { nested: { deep: [1] } }, null, "x", 1, [], [{}], undefined]) {
    cases.push([
      `meta ${JSON.stringify(value) ?? "undefined"}`,
      patched(fullCall(), { meta: value }),
    ]);
  }

  // timestamp.
  for (const value of TIMESTAMPS) {
    cases.push([`timestamp ${JSON.stringify(value)}`, patched(fullCall(), { timestamp: value })]);
  }

  // Not an object.
  for (const value of [null, undefined, 0, "record", true, [], [fullCall()]]) {
    cases.push([
      `input ${JSON.stringify(value) === undefined ? "undefined" : Array.isArray(value) ? `array of ${value.length}` : JSON.stringify(value)}`,
      value,
    ]);
  }
  return cases;
}

const SYNTHETIC = synthetic();
const CORPUS: Case[] = fixtureTraces().flatMap((trace) =>
  trace.lines.map((line): Case => [`${trace.name}:${line.number}`, JSON.parse(line.text)]),
);

describe("validateRecord agrees with the pinned JSON Schema", () => {
  it("has non-degenerate inputs", () => {
    expect(CORPUS.length).toBeGreaterThan(0);
    for (const [, base] of Object.entries(BASES)) expect(ajvValidate(base())).toBe(true);
    const accepted = SYNTHETIC.filter(([, input]) => expected(input)).length;
    const rejected = SYNTHETIC.length - accepted;
    expect(accepted).toBeGreaterThanOrEqual(30);
    expect(rejected).toBeGreaterThanOrEqual(100);
    expect(new Set(SYNTHETIC.map(([label]) => label)).size).toBe(SYNTHETIC.length);
  });

  describe("on every corpus record", () => {
    it.each(CORPUS)("%s", (_, input) => {
      expect(expected(input)).toBe(true);
      expect(validateRecord(input).ok).toBe(true);
    });
  });

  describe("on synthetic records", () => {
    it.each(SYNTHETIC)("%s", (_, input) => {
      expect(validateRecord(input).ok).toBe(expected(input));
    });
  });
});

/** Every key of any member of a union (`keyof` alone keeps only common keys). */
type AnyKey<T> = T extends unknown ? keyof T : never;
/** Required keys of one object type (not distributed over a union). */
type RequiredKey<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K;
}[keyof T];
/** Keys that every record requires, whatever its message type. */
type CommonRequiredKey = RequiredKey<CallRecord> &
  RequiredKey<CallResultRecord> &
  RequiredKey<CallErrorRecord>;

/** Record fields, in the order of the schema's `properties`. */
const RECORD_KEYS = [
  "schemaVersion",
  "timestamp",
  "ocppVersion",
  "transport",
  "chargePointId",
  "connectorId",
  "direction",
  "messageType",
  "messageId",
  "action",
  "payload",
  "raw",
  "error",
  "meta",
] as const;

/** `error` fields, in the order of the schema's `error.properties`. */
const ERROR_KEYS = ["code", "description", "details"] as const;

describe("the model matches the pinned JSON Schema", () => {
  const properties = schema["properties"] as Record<
    string,
    { enum?: unknown; properties?: Record<string, unknown> }
  >;

  it("declares the same fields", () => {
    expect(Object.keys(properties)).toEqual(RECORD_KEYS);
    expectTypeOf<(typeof RECORD_KEYS)[number]>().toEqualTypeOf<AnyKey<TraceRecord>>();
  });

  it("declares the same error fields", () => {
    expect(Object.keys(properties["error"]?.properties ?? {})).toEqual(ERROR_KEYS);
    expectTypeOf<(typeof ERROR_KEYS)[number]>().toEqualTypeOf<keyof TraceError>();
  });

  it("requires the same fields", () => {
    expect(schema["required"]).toEqual(REQUIRED);
    expectTypeOf<(typeof REQUIRED)[number]>().toEqualTypeOf<CommonRequiredKey>();
    expectTypeOf<RequiredKey<CallRecord>>().toEqualTypeOf<(typeof REQUIRED)[number] | "action">();
    expectTypeOf<RequiredKey<CallErrorRecord>>().toEqualTypeOf<
      (typeof REQUIRED)[number] | "error"
    >();
  });

  it("allows the same enum values, in schema order", () => {
    expect(properties["transport"]?.enum).toEqual(TRANSPORTS);
    expect(properties["direction"]?.enum).toEqual(DIRECTIONS);
    expect(properties["messageType"]?.enum).toEqual(MESSAGE_TYPES);
  });
});
