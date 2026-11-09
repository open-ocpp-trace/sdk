import type { TraceRecord } from "@open-ocpp-trace/core";

/**
 * Hands `value` to the writer as a `TraceRecord`, the way an untyped
 * JavaScript caller or a cast would, so the tests can exercise the runtime
 * validation the types otherwise rule out.
 */
export function untyped(value: unknown): TraceRecord {
  return value as TraceRecord;
}

/** `untyped` for a sequence of values. */
export function untypedAll(values: readonly unknown[]): TraceRecord[] {
  return values.map(untyped);
}
