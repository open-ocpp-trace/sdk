import type { ValidationIssue } from "@open-ocpp-trace/core";

/**
 * Why a record could not be written as a JSONL line.
 *
 * - `validation`: the record is not a valid trace record; `issues` lists
 *   every broken rule and `cause` holds core's `TraceValidationError`.
 * - `to-json`: validation is on and the record, though valid, has a
 *   top-level `toJSON` method (own or inherited), whose result
 *   `JSON.stringify` would write in place of the validated fields.
 * - `unserializable`: `JSON.stringify` threw, for a circular structure, a
 *   `BigInt` or a throwing `toJSON`; `cause` holds the original error.
 * - `no-output`: `JSON.stringify` returned nothing, for a top-level
 *   `undefined`, function or symbol, or a top-level `toJSON` returning
 *   `undefined` (only reachable with `validate: false`, since validation
 *   requires an object and rejects a top-level `toJSON`).
 * - `not-an-object`: the output is JSON but not an object, such as a string,
 *   `null` or an array (only reachable with `validate: false`, for the same
 *   reason).
 */
export type JsonlWriteErrorKind =
  | "validation"
  | "to-json"
  | "unserializable"
  | "no-output"
  | "not-an-object";

export interface JsonlWriteErrorInit {
  /** 0-based position of the record in its input sequence, if any. */
  readonly index?: number;
  readonly kind: JsonlWriteErrorKind;
  /** Explanation, prefixed with the record index by the constructor. */
  readonly detail: string;
  readonly issues?: readonly ValidationIssue[];
  readonly cause?: unknown;
}

/** A record that could not be written as one JSONL line. */
export class JsonlWriteError extends Error {
  override readonly name: string = "JsonlWriteError";
  /**
   * 0-based position of the record in the sequence given to
   * `serializeRecords` or `writeRecords`; `undefined` for `serializeRecord`.
   */
  readonly index: number | undefined;
  readonly kind: JsonlWriteErrorKind;
  /** Broken rules for a `validation` error; empty for every other kind. */
  readonly issues: readonly ValidationIssue[];

  constructor(init: JsonlWriteErrorInit) {
    const message = init.index === undefined ? init.detail : `Record ${init.index}: ${init.detail}`;
    if ("cause" in init) super(message, { cause: init.cause });
    else super(message);
    this.index = init.index;
    this.kind = init.kind;
    this.issues = init.issues ?? [];
  }
}
