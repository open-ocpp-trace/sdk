import type { ValidationIssue } from "@open-ocpp-trace/core";

/**
 * Why a line could not be read as a trace record.
 *
 * - `json`: the line is not valid JSON; `cause` holds the parser error.
 * - `validation`: the line is JSON but not a valid trace record; `issues`
 *   lists every broken rule.
 * - `line-too-long`: the line is longer than `maxLineBytes`.
 * - `encoding`: the line is not valid UTF-8; `cause` holds the decoder error.
 */
export type JsonlReadErrorKind = "json" | "validation" | "line-too-long" | "encoding";

export interface JsonlReadErrorInit {
  /** 1-based number of the offending line in the stream. */
  readonly line: number;
  readonly kind: JsonlReadErrorKind;
  /** Explanation, prefixed with the line number by the constructor. */
  readonly detail: string;
  readonly issues?: readonly ValidationIssue[];
  readonly cause?: unknown;
}

/** A line of a JSONL stream that is not a readable trace record. */
export class JsonlReadError extends Error {
  override readonly name: string = "JsonlReadError";
  /** 1-based number of the offending line in the stream. */
  readonly line: number;
  readonly kind: JsonlReadErrorKind;
  /** Broken rules for a `validation` error; empty for every other kind. */
  readonly issues: readonly ValidationIssue[];

  constructor(init: JsonlReadErrorInit) {
    const message = `Line ${init.line}: ${init.detail}`;
    if ("cause" in init) super(message, { cause: init.cause });
    else super(message);
    this.line = init.line;
    this.kind = init.kind;
    this.issues = init.issues ?? [];
  }
}
