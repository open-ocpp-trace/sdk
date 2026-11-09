import { isDateTime } from "./date-time.ts";
import { DIRECTIONS, MESSAGE_TYPES, TRANSPORTS, type TraceRecord } from "./record.ts";
import {
  isSupportedSchemaVersion,
  isWellFormedSchemaVersion,
  SUPPORTED_SCHEMA_MAJOR,
} from "./version.ts";

/** Kind of rule a value breaks. */
export type ValidationIssueCode =
  /** A required field is absent. */
  | "required"
  /** A field is present where the record's message type forbids it. */
  | "forbidden"
  /** A value has the wrong JSON type. */
  | "type"
  /** A string is not one of the allowed values. */
  | "enum"
  /** A string does not have the required format. */
  | "format"
  /** A number is below the allowed minimum. */
  | "minimum"
  /** A well-formed `schemaVersion` belongs to a major this package does not read. */
  | "unsupported-version";

/** One broken rule, located by a JSON Pointer into the validated input. */
export interface ValidationIssue {
  /** JSON Pointer (RFC 6901) of the offending value; `""` is the record itself. */
  readonly path: string;
  readonly code: ValidationIssueCode;
  /** Human-readable explanation naming the expected value. */
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly record: TraceRecord }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

/** Thrown by {@link assertRecord}; `issues` lists every broken rule. */
export class TraceValidationError extends Error {
  override readonly name: string = "TraceValidationError";
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const details = issues.map((issue) => `${issue.path || "/"}: ${issue.message}`);
    super(`Invalid trace record: ${details.join("; ")}`);
    this.issues = issues;
  }
}

type JsonObject = Record<string, unknown>;

// Predicates follow Ajv 8 so that the verdict matches the JSON Schema:
// "object" excludes null and arrays, "integer" excludes NaN and infinities
// (`strictNumbers` is on by default), and a property is absent when its value
// is `undefined`.
function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoted(values: readonly string[]): string {
  return values.map((value) => JSON.stringify(value)).join(", ");
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

const STRING_FIELDS = ["ocppVersion", "chargePointId", "messageId", "action", "raw"] as const;

class Collector {
  readonly issues: ValidationIssue[] = [];

  add(path: string, code: ValidationIssueCode, message: string): void {
    this.issues.push({ path, code, message });
  }

  /** Records a type issue unless `value` is a string; returns whether it is one. */
  string(path: string, value: unknown): value is string {
    if (typeof value === "string") return true;
    this.add(path, "type", `expected a string, got ${describe(value)}`);
    return false;
  }

  enum(path: string, value: unknown, allowed: readonly string[]): void {
    if (!this.string(path, value)) return;
    if (!allowed.includes(value)) {
      this.add(path, "enum", `expected one of ${quoted(allowed)}, got ${JSON.stringify(value)}`);
    }
  }
}

function checkSchemaVersion(issues: Collector, value: unknown): void {
  const path = "/schemaVersion";
  if (!issues.string(path, value) || isSupportedSchemaVersion(value)) return;
  const expected = `expected "${SUPPORTED_SCHEMA_MAJOR}.<minor>"`;
  if (isWellFormedSchemaVersion(value)) {
    issues.add(
      path,
      "unsupported-version",
      `${expected}: major version of ${JSON.stringify(value)} is not supported`,
    );
  } else {
    issues.add(path, "format", `${expected} with digits only, got ${JSON.stringify(value)}`);
  }
}

function checkError(issues: Collector, error: unknown): void {
  if (!isObject(error)) {
    issues.add("/error", "type", `expected an object, got ${describe(error)}`);
    return;
  }
  for (const field of ["code", "description"]) {
    if (error[field] !== undefined) issues.string(`/error/${field}`, error[field]);
  }
}

/** Applies the per-message-type rules, once `messageType` is known to be valid. */
function checkMessageType(issues: Collector, record: JsonObject, type: string): void {
  if (type === "CALL" && record["action"] === undefined) {
    issues.add(
      "/action",
      "required",
      'missing field "action", required when messageType is "CALL"',
    );
  }
  if (type === "CALLERROR") {
    if (record["error"] === undefined) {
      issues.add(
        "/error",
        "required",
        'missing field "error", required when messageType is "CALLERROR"',
      );
    } else {
      checkError(issues, record["error"]);
    }
  } else if (record["error"] !== undefined) {
    issues.add(
      "/error",
      "forbidden",
      `unexpected field "error" on a ${type}: only allowed when messageType is "CALLERROR"`,
    );
  }
}

/**
 * Checks that `input` is a trace record of a supported format version.
 *
 * Every broken rule is reported, not only the first. On success the result
 * holds the input object itself: nothing is cloned or normalised, and unknown
 * top-level fields, `error` fields and `meta` are kept as they are.
 */
export function validateRecord(input: unknown): ValidationResult {
  if (!isObject(input)) {
    return {
      ok: false,
      issues: [{ path: "", code: "type", message: `expected an object, got ${describe(input)}` }],
    };
  }
  const issues = new Collector();

  const required = ["schemaVersion", "timestamp", "transport", "direction", "messageType"];
  for (const field of required) {
    if (input[field] === undefined) issues.add(`/${field}`, "required", `missing field "${field}"`);
  }

  const { schemaVersion, timestamp, transport, direction, messageType } = input;
  if (schemaVersion !== undefined) checkSchemaVersion(issues, schemaVersion);
  if (timestamp !== undefined && issues.string("/timestamp", timestamp) && !isDateTime(timestamp)) {
    issues.add(
      "/timestamp",
      "format",
      `expected an RFC 3339 date-time with a timezone, such as "2025-01-15T10:30:00Z", got ${JSON.stringify(timestamp)}`,
    );
  }
  if (transport !== undefined) issues.enum("/transport", transport, TRANSPORTS);
  if (direction !== undefined) issues.enum("/direction", direction, DIRECTIONS);
  if (messageType !== undefined) issues.enum("/messageType", messageType, MESSAGE_TYPES);

  for (const field of STRING_FIELDS) {
    if (input[field] !== undefined) issues.string(`/${field}`, input[field]);
  }
  const { connectorId, meta } = input;
  if (connectorId !== undefined) {
    if (typeof connectorId !== "number" || !Number.isInteger(connectorId)) {
      const got = typeof connectorId === "number" ? String(connectorId) : describe(connectorId);
      issues.add("/connectorId", "type", `expected an integer, got ${got}`);
    } else if (connectorId < 0) {
      issues.add("/connectorId", "minimum", `expected an integer >= 0, got ${connectorId}`);
    }
  }
  if (meta !== undefined && !isObject(meta)) {
    issues.add("/meta", "type", `expected an object, got ${describe(meta)}`);
  }

  // The schema's if/then/else rules are applied only to a valid messageType.
  // An invalid or missing one already fails the record, so skipping them
  // changes no verdict and avoids issues that follow from the first one.
  if (
    typeof messageType === "string" &&
    (MESSAGE_TYPES as readonly string[]).includes(messageType)
  ) {
    checkMessageType(issues, input, messageType);
  }

  if (issues.issues.length > 0) return { ok: false, issues: issues.issues };
  return { ok: true, record: input as unknown as TraceRecord };
}

/** Returns `input` typed as a record, or throws a {@link TraceValidationError}. */
export function assertRecord(input: unknown): TraceRecord {
  const result = validateRecord(input);
  if (!result.ok) throw new TraceValidationError(result.issues);
  return result.record;
}
