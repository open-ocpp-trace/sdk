import { validateRecord, type TraceRecord } from "@open-ocpp-trace/core";

import { JsonlReadError } from "./errors.ts";

/**
 * Outcome of reading one line: the record and its line number, or the
 * error that makes the line unreadable.
 */
export type ReadResult =
  | { readonly ok: true; readonly record: TraceRecord; readonly line: number }
  | { readonly ok: false; readonly error: JsonlReadError };

export interface ParseRecordOptions {
  /** 1-based line number reported with the result. Defaults to 1. */
  readonly line?: number;
}

/**
 * Parses one JSONL line (without its terminator) into a validated trace
 * record. Never throws for bad input: a `json` or `validation` error is
 * returned instead, so that callers choose between failing and skipping.
 *
 * The record is the object built by `JSON.parse`, returned as is: string
 * fields such as `raw`, `timestamp` and `messageId`, unknown fields and
 * `meta` keep their exact values.
 */
export function parseRecord(text: string, options: ParseRecordOptions = {}): ReadResult {
  const line = options.line ?? 1;
  if (!Number.isSafeInteger(line) || line < 1) {
    throw new RangeError(`line must be a positive integer, got ${line}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      error: new JsonlReadError({ line, kind: "json", detail: `invalid JSON: ${reason}`, cause }),
    };
  }
  const result = validateRecord(value);
  if (result.ok) return { ok: true, record: result.record, line };
  const details = result.issues.map((issue) => `${issue.path || "/"}: ${issue.message}`);
  return {
    ok: false,
    error: new JsonlReadError({
      line,
      kind: "validation",
      detail: `invalid trace record: ${details.join("; ")}`,
      issues: result.issues,
    }),
  };
}
