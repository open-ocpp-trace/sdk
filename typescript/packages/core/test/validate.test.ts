import { describe, expect, it } from "vite-plus/test";

import {
  assertRecord,
  TraceValidationError,
  validateRecord,
  type TraceRecord,
  type ValidationIssue,
  type ValidationIssueCode,
} from "../src/index.ts";
import { BASE_FIELDS as BASE } from "./support/records.ts";

const CALL = { ...BASE, messageType: "CALL", action: "Heartbeat" } as const;
const CALLRESULT = { ...BASE, messageType: "CALLRESULT" } as const;
const CALLERROR = {
  ...BASE,
  messageType: "CALLERROR",
  error: { code: "NotImplemented" },
} as const;

/** Issues reduced to `[path, code]` pairs, the part tests pin exactly. */
function issuesOf(input: unknown): Array<[string, ValidationIssueCode]> {
  const result = validateRecord(input);
  return result.ok ? [] : result.issues.map((issue) => [issue.path, issue.code]);
}

function onlyIssue(input: unknown): ValidationIssue {
  const result = validateRecord(input);
  if (result.ok) throw new Error("expected an invalid record");
  expect(result.issues).toHaveLength(1);
  return result.issues[0]!;
}

describe("validateRecord: valid records", () => {
  it.each([
    ["CALL", CALL],
    ["CALLRESULT", CALLRESULT],
    ["CALLERROR", CALLERROR],
  ])("accepts a minimal %s and returns the same object", (_, input) => {
    const result = validateRecord(input);
    expect(result).toEqual({ ok: true, record: input });
    if (result.ok) expect(result.record).toBe(input);
  });

  it("accepts every optional field", () => {
    const input = {
      ...BASE,
      messageType: "CALLERROR",
      ocppVersion: "1.6",
      chargePointId: "CP-001",
      connectorId: 0,
      messageId: "19223201",
      action: "BootNotification",
      payload: [1, "two", null],
      raw: '[4,"19223201","NotImplemented","",{}]',
      error: { code: "NotImplemented", description: "", details: { a: 1 } },
      meta: {},
    };
    expect(issuesOf(input)).toEqual([]);
  });

  it("accepts any JSON value as payload and error details", () => {
    for (const value of [null, 0, "", false, [], {}]) {
      expect(issuesOf({ ...CALL, payload: value })).toEqual([]);
      expect(issuesOf({ ...CALLERROR, error: { details: value } })).toEqual([]);
    }
  });

  it("accepts an empty error object", () => {
    expect(issuesOf({ ...CALLERROR, error: {} })).toEqual([]);
  });

  it("preserves unknown top-level, error and meta fields by identity", () => {
    const meta = { producer: { name: "sim", nested: [1, { deep: true }] } };
    const error = { code: "InternalError", vendorCode: 42 };
    const input = { ...CALLERROR, error, meta, futureField: { x: 1 } };
    const result = validateRecord(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toBe(input);
    expect(result.record.meta).toBe(meta);
    expect(result.record.error).toBe(error);
    expect(Object.keys(result.record)).toEqual(Object.keys(input));
    const extended = result.record as TraceRecord & { futureField?: unknown };
    expect(extended.futureField).toBe(input.futureField);
  });

  it("does not normalise string fields", () => {
    const input = { ...CALL, timestamp: "2025-01-15t10:30:00.5+0100", messageId: " 01 " };
    const result = validateRecord(input);
    expect(result.ok && result.record.timestamp).toBe("2025-01-15t10:30:00.5+0100");
    expect(result.ok && result.record.messageId).toBe(" 01 ");
  });

  it("treats a field set to undefined as absent, as JSON Schema validators do", () => {
    expect(issuesOf({ ...CALLRESULT, error: undefined, meta: undefined })).toEqual([]);
  });
});

describe("validateRecord: non-object input", () => {
  it.each([null, undefined, [], [CALL], "{}", 42, true])("rejects %j at the root", (input) => {
    const issue = onlyIssue(input);
    expect(issue.path).toBe("");
    expect(issue.code).toBe("type");
    expect(issue.message).toContain("object");
  });

  it('names the root as <root> in the error message, since the pointer / is the key ""', () => {
    expect(() => assertRecord(null)).toThrow(
      "Invalid trace record: <root>: expected an object, got null",
    );
  });
});

describe("validateRecord: required fields", () => {
  it("reports every missing required field of an empty object", () => {
    expect(issuesOf({})).toEqual([
      ["/schemaVersion", "required"],
      ["/timestamp", "required"],
      ["/transport", "required"],
      ["/direction", "required"],
      ["/messageType", "required"],
    ]);
  });

  it.each(["schemaVersion", "timestamp", "transport", "direction", "messageType"])(
    "reports a missing %s",
    (field) => {
      const input: Record<string, unknown> = { ...CALL };
      delete input[field];
      const issue = onlyIssue(input);
      expect([issue.path, issue.code]).toEqual([`/${field}`, "required"]);
      expect(issue.message).toContain(field);
    },
  );

  it("requires action on a CALL", () => {
    const issue = onlyIssue({ ...BASE, messageType: "CALL" });
    expect([issue.path, issue.code]).toEqual(["/action", "required"]);
    expect(issue.message).toContain("CALL");
  });

  it("requires error on a CALLERROR", () => {
    const issue = onlyIssue({ ...BASE, messageType: "CALLERROR" });
    expect([issue.path, issue.code]).toEqual(["/error", "required"]);
    expect(issue.message).toContain("CALLERROR");
  });

  it.each([
    ["CALL", CALL],
    ["CALLRESULT", CALLRESULT],
  ])("forbids error on a %s", (type, record) => {
    const issue = onlyIssue({ ...record, error: { code: "X" } });
    expect([issue.path, issue.code]).toEqual(["/error", "forbidden"]);
    expect(issue.message).toContain(type);
    expect(issue.message).toContain("CALLERROR");
  });

  it("forbids error on a CALLRESULT whatever its type", () => {
    expect(issuesOf({ ...CALLRESULT, error: "boom" })).toEqual([["/error", "forbidden"]]);
  });
});

describe("validateRecord: types", () => {
  it.each([
    ["schemaVersion", 1.1, "string"],
    ["timestamp", 1736937000000, "string"],
    ["transport", null, "string"],
    ["direction", 1, "string"],
    ["messageType", ["CALL"], "string"],
    ["ocppVersion", 1.6, "string"],
    ["chargePointId", 7, "string"],
    ["messageId", 19223201, "string"],
    ["action", null, "string"],
    ["raw", { frame: [] }, "string"],
    ["connectorId", "1", "integer"],
    ["connectorId", 1.5, "integer"],
    ["connectorId", Number.NaN, "integer"],
    ["connectorId", Number.POSITIVE_INFINITY, "integer"],
    ["meta", [], "object"],
    ["meta", null, "object"],
    ["meta", "x", "object"],
  ])("rejects %s = %j, expecting %s", (field, value, expected) => {
    const issue = onlyIssue({ ...CALL, [field]: value });
    expect([issue.path, issue.code]).toEqual([`/${field}`, "type"]);
    expect(issue.message).toContain(expected);
  });

  it("checks action on records other than CALL", () => {
    expect(issuesOf({ ...CALLRESULT, action: 1 })).toEqual([["/action", "type"]]);
  });

  it.each([[null], [[]], ["NotImplemented"], [0]])("rejects error = %j", (error) => {
    const issue = onlyIssue({ ...CALLERROR, error });
    expect([issue.path, issue.code]).toEqual(["/error", "type"]);
    expect(issue.message).toContain("object");
  });

  it("checks error.code and error.description", () => {
    expect(issuesOf({ ...CALLERROR, error: { code: 1, description: false } })).toEqual([
      ["/error/code", "type"],
      ["/error/description", "type"],
    ]);
  });
});

describe("validateRecord: values", () => {
  it.each([
    ["transport", "JSON", ["json", "soap"]],
    ["direction", "cp-to-cp", ["cp-to-csms", "csms-to-cp"]],
    ["messageType", "call", ["CALL", "CALLRESULT", "CALLERROR"]],
  ])("rejects %s = %j, listing the allowed values", (field, value, allowed) => {
    const issue = onlyIssue({ ...CALL, [field]: value });
    expect([issue.path, issue.code]).toEqual([`/${field}`, "enum"]);
    for (const expected of allowed) expect(issue.message).toContain(`"${expected}"`);
  });

  it("rejects a negative connectorId", () => {
    const issue = onlyIssue({ ...CALL, connectorId: -1 });
    expect([issue.path, issue.code]).toEqual(["/connectorId", "minimum"]);
    expect(issue.message).toContain("0");
  });

  it.each([0, 1, 1.0, -0, Number.MAX_SAFE_INTEGER])("accepts connectorId %j", (connectorId) => {
    expect(issuesOf({ ...CALL, connectorId })).toEqual([]);
  });

  it.each(["2025-01-15T10:30:00", "2025-02-30T10:30:00Z", "", "yesterday"])(
    "rejects timestamp %j",
    (timestamp) => {
      const issue = onlyIssue({ ...CALL, timestamp });
      expect([issue.path, issue.code]).toEqual(["/timestamp", "format"]);
      expect(issue.message).toContain("RFC 3339");
    },
  );
});

describe("validateRecord: schemaVersion policy", () => {
  it.each(["1.0", "1.1", "1.10", "1.42"])("accepts %j", (schemaVersion) => {
    expect(issuesOf({ ...CALL, schemaVersion })).toEqual([]);
  });

  it.each(["2.0", "0.9"])("rejects another major %j", (schemaVersion) => {
    const issue = onlyIssue({ ...CALL, schemaVersion });
    expect([issue.path, issue.code]).toEqual(["/schemaVersion", "unsupported-version"]);
    expect(issue.message).toContain('"1.<minor>"');
  });

  it.each(["1", "v1.1", "", "1.1.0", "1.x", "01.1", "1.01"])(
    "rejects malformed %j",
    (schemaVersion) => {
      const issue = onlyIssue({ ...CALL, schemaVersion });
      expect([issue.path, issue.code]).toEqual(["/schemaVersion", "format"]);
      expect(issue.message).toContain('"1.<minor>"');
    },
  );
});

describe("validateRecord: collecting issues", () => {
  it("reports every issue of a record, not only the first", () => {
    expect(
      issuesOf({
        schemaVersion: "2.0",
        timestamp: "now",
        transport: "http",
        direction: 3,
        messageType: "CALL",
        connectorId: -2,
        meta: [],
      }),
    ).toEqual([
      ["/schemaVersion", "unsupported-version"],
      ["/timestamp", "format"],
      ["/transport", "enum"],
      ["/direction", "type"],
      ["/connectorId", "minimum"],
      ["/meta", "type"],
      ["/action", "required"],
    ]);
  });

  it("skips the messageType rules when messageType itself is invalid", () => {
    expect(issuesOf({ ...BASE, messageType: "NOTIFY", error: { code: "X" } })).toEqual([
      ["/messageType", "enum"],
    ]);
  });
});

describe("assertRecord", () => {
  it("returns the same object when valid", () => {
    expect(assertRecord(CALL)).toBe(CALL);
  });

  it("throws a TraceValidationError carrying every issue", () => {
    let caught: unknown;
    try {
      assertRecord({ ...BASE, messageType: "CALL", connectorId: -1 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TraceValidationError);
    expect(caught).toBeInstanceOf(Error);
    const error = caught as TraceValidationError;
    expect(error.name).toBe("TraceValidationError");
    expect(error.issues.map((issue) => issue.path)).toEqual(["/connectorId", "/action"]);
    expect(error.message).toContain("/connectorId");
    expect(error.message).toContain("/action");
  });

  it("throws on non-object input", () => {
    expect(() => assertRecord(null)).toThrow(TraceValidationError);
  });
});
