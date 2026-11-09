// Type-checked with `tsc --noEmit` in a throwaway project that installed
// the packed tarballs, once per module resolution mode. Reaches types and
// values through every public entry point, as a consumer does.

import {
  SCHEMA_VERSION,
  validateRecord,
  type CallRecord,
  type TraceRecord,
  type ValidationResult,
} from "@open-ocpp-trace/core";
import { JsonlWriteError, readRecords as readFromRoot } from "@open-ocpp-trace/jsonl";
import { readRecords, type ChunkSource, type ReadResult } from "@open-ocpp-trace/jsonl/reader";
import { serializeRecord, writeRecords, type LineSink } from "@open-ocpp-trace/jsonl/writer";

const call: CallRecord = {
  schemaVersion: SCHEMA_VERSION,
  timestamp: "2025-01-15T10:30:00.000Z",
  transport: "json",
  direction: "cp-to-csms",
  messageType: "CALL",
  action: "Heartbeat",
};

const result: ValidationResult = validateRecord(call);
const line: string = serializeRecord(call);
const source: ChunkSource = [line];
const sink: LineSink = { write: (_chunk: string) => undefined };

export async function roundTrip(): Promise<TraceRecord[]> {
  await writeRecords([call], sink);
  const records: TraceRecord[] = [];
  for await (const record of readRecords(source)) records.push(record);
  for await (const item of readFromRoot(source, { onError: "yield" })) {
    const typed: ReadResult = item;
    if (typed.ok) records.push(typed.record);
  }
  return records;
}

export const checks: readonly unknown[] = [
  result,
  new JsonlWriteError({ kind: "validation", detail: "smoke" }),
];

// @ts-expect-error The writer takes a `TraceRecord`, not any object.
serializeRecord({ messageType: "CALL" });
