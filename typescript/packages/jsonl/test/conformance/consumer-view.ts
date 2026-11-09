// The consumer view of a trace, as defined by the specification's
// `conformance/README.md` (« The consumer view » and « Correlation rule »).
//
// This is a test helper, not SDK API (see docs/architecture.md, « Out of
// scope »): it lets the conformance tests check that the records the reader
// returns are enough to reproduce every fixture's `expected.json`.

import type { TraceRecord } from "@open-ocpp-trace/core";

export interface ConsumerViewEntry {
  readonly index: number;
  readonly messageType: TraceRecord["messageType"];
  readonly messageId?: string;
  /** Effective action: explicit on a CALL or an orphan, derived for a correlated response. */
  readonly action?: string;
  /** For a correlated response, the index of its CALL. */
  readonly correlatesWith?: number;
}

export interface ConsumerView {
  readonly schemaVersion: string;
  readonly counts: {
    readonly records: number;
    readonly calls: number;
    readonly callResults: number;
    readonly callErrors: number;
  };
  readonly records: readonly ConsumerViewEntry[];
  readonly unansweredCalls: readonly number[];
  readonly orphanResponses: readonly number[];
}

/**
 * Derives the consumer view of `records`, in trace order.
 *
 * A CALLRESULT or CALLERROR correlates with the most recent preceding CALL
 * that has the same `messageId`, the opposite `direction`, and no earlier
 * response. A correlated response takes its CALL's action; an orphan keeps
 * the action it carries, if any. Absent values are omitted, never written
 * as `undefined`, so that a strict comparison with `expected.json` holds.
 */
export function consumerView(records: readonly TraceRecord[]): ConsumerView {
  const answered = new Set<number>();
  const orphanResponses: number[] = [];
  const entries = records.map((record, index): ConsumerViewEntry => {
    const base = {
      index,
      messageType: record.messageType,
      ...(record.messageId === undefined ? {} : { messageId: record.messageId }),
    };
    if (record.messageType === "CALL") {
      return { ...base, ...(record.action === undefined ? {} : { action: record.action }) };
    }
    const call = correlatedCall(records, index, answered);
    if (call === undefined) {
      orphanResponses.push(index);
      return { ...base, ...(record.action === undefined ? {} : { action: record.action }) };
    }
    answered.add(call);
    const action = records[call]?.action;
    return { ...base, ...(action === undefined ? {} : { action }), correlatesWith: call };
  });
  const count = (type: TraceRecord["messageType"]) =>
    records.filter((record) => record.messageType === type).length;
  return {
    schemaVersion: records[0]?.schemaVersion ?? "unknown",
    counts: {
      records: records.length,
      calls: count("CALL"),
      callResults: count("CALLRESULT"),
      callErrors: count("CALLERROR"),
    },
    records: entries,
    unansweredCalls: records.flatMap((record, index) =>
      record.messageType === "CALL" && !answered.has(index) ? [index] : [],
    ),
    orphanResponses,
  };
}

/** Index of the CALL the response at `index` correlates with, if any. */
function correlatedCall(
  records: readonly TraceRecord[],
  index: number,
  answered: ReadonlySet<number>,
): number | undefined {
  const response = records[index];
  if (response === undefined) return undefined;
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    const call = records[candidate];
    if (
      call?.messageType === "CALL" &&
      call.messageId === response.messageId &&
      call.direction !== response.direction &&
      !answered.has(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}
