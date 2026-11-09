import { TraceValidationError, validateRecord, type TraceRecord } from "@open-ocpp-trace/core";

import { JsonlWriteError, type JsonlWriteErrorInit, type JsonlWriteErrorKind } from "./errors.ts";

export interface SerializeRecordOptions {
  /**
   * Check the record with core's `validateRecord` before writing it, and
   * reject a record with a top-level `toJSON` method. Defaults to `true`.
   * With `false`, any value whose `JSON.stringify` output is a JSON object
   * is written.
   */
  readonly validate?: boolean;
}

/** Throws a `TypeError` for an option the writer does not understand. */
export function checkSerializeOptions(options: SerializeRecordOptions): boolean {
  const validate = options.validate ?? true;
  if (typeof validate !== "boolean") {
    throw new TypeError(`validate must be a boolean, got ${typeof validate}`);
  }
  return validate;
}

/**
 * Serialises one trace record as one JSONL line: the output of
 * `JSON.stringify(record)`, compact and in the record's own key order,
 * followed by a single LF. `JSON.stringify` escapes CR, LF and lone
 * surrogates, so the line holds no other terminator and encodes to valid
 * UTF-8; U+2028 and U+2029 are written as is, which JSONL allows.
 *
 * Unknown fields, `meta` and `raw` are written as given. What
 * `JSON.stringify` changes silently is not detected inside `payload`,
 * `meta` or `error.details`: properties holding `undefined`, a function or
 * a symbol are omitted, the same values in an array become `null`, `NaN`
 * and `±Infinity` become `null`, and a `toJSON` method's result is written
 * in place of the object. An `undefined` top-level field is absent for
 * validation and omitted from the line, so it reads back as absent.
 *
 * The record is typed `TraceRecord` whenever validation may be on; with
 * `{ validate: false }` it is `unknown`.
 *
 * @throws {JsonlWriteError} `validation` when validation is on and the
 * record is invalid; `to-json` when validation is on and the record has a
 * top-level `toJSON` method, own or inherited, whose result would be
 * written instead of the validated fields; `unserializable`, `no-output` or
 * `not-an-object` when `JSON.stringify` throws or does not produce a JSON
 * object. Never returns a partial line.
 * @throws {TypeError} when `validate` is not a boolean.
 */
export function serializeRecord(record: TraceRecord, options?: SerializeRecordOptions): string;
export function serializeRecord(
  record: unknown,
  options: SerializeRecordOptions & { readonly validate: false },
): string;
export function serializeRecord(record: unknown, options: SerializeRecordOptions = {}): string {
  return serializeAt(record, checkSerializeOptions(options), undefined);
}

/** Serialises `record`, reporting `index` in any error. */
export function serializeAt(record: unknown, validate: boolean, index: number | undefined): string {
  // No `index` key without an index, and no `cause` key unless one is given.
  const fail = (
    kind: JsonlWriteErrorKind,
    detail: string,
    extra?: Pick<JsonlWriteErrorInit, "issues" | "cause">,
  ): JsonlWriteError =>
    new JsonlWriteError({ ...(index === undefined ? {} : { index }), kind, detail, ...extra });

  if (validate) {
    const result = validateRecord(record);
    if (!result.ok) {
      const cause = new TraceValidationError(result.issues);
      throw fail("validation", cause.message, { issues: result.issues, cause });
    }
  }
  let json: string | undefined;
  try {
    // A `toJSON` result would be written in place of the validated fields.
    // The lookup sits in the try: a throwing getter is unserialisable, as
    // it is when `JSON.stringify` reaches it.
    if (validate && typeof (record as { toJSON?: unknown }).toJSON === "function") {
      throw fail(
        "to-json",
        "the record has a toJSON method, whose result would be written unvalidated",
      );
    }
    // `JSON.stringify` returns `undefined` for a top-level `undefined`,
    // function or symbol, despite its declared `string` return type.
    json = JSON.stringify(record) as string | undefined;
  } catch (cause) {
    if (cause instanceof JsonlWriteError) throw cause;
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw fail("unserializable", `cannot serialise the record as JSON: ${reason}`, { cause });
  }
  if (json === undefined) {
    throw fail("no-output", `JSON.stringify produced no output for a ${typeof record}`);
  }
  if (!json.startsWith("{")) {
    throw fail("not-an-object", "the record does not serialise to a JSON object");
  }
  return `${json}\n`;
}
