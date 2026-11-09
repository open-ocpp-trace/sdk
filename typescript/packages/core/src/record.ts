/** Transports allowed by the trace format, in schema order. */
export const TRANSPORTS = ["json", "soap"] as const;

/** Directions allowed by the trace format, in schema order. */
export const DIRECTIONS = ["cp-to-csms", "csms-to-cp"] as const;

/** OCPP-J message types allowed by the trace format, in schema order. */
export const MESSAGE_TYPES = ["CALL", "CALLRESULT", "CALLERROR"] as const;

export type Transport = (typeof TRANSPORTS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];

/**
 * The `error` object of a CALLERROR record.
 *
 * The schema allows additional properties here as on the record itself; see
 * {@link TraceRecordFields} for how they are modelled.
 */
export interface TraceError {
  code?: string;
  description?: string;
  details?: unknown;
}

/**
 * Fields shared by every record, whatever its message type.
 *
 * Unknown top-level fields: the schema allows them (`additionalProperties:
 * true`) and the SDK preserves them at runtime, since validation returns the
 * input object untouched. The type deliberately has no index signature: the
 * format tells producers to put extensions in `meta`, never in undeclared
 * top-level fields, so an object literal with an extra field is a type error,
 * and a misspelt field name is caught instead of reading as `unknown`.
 * Consumers that need a field from a newer minor version read it through a
 * widening cast, e.g. `(record as TraceRecord & { newField?: unknown }).newField`.
 */
export interface TraceRecordFields {
  /** Format version of the record, `"<major>.<minor>"`. */
  schemaVersion: string;
  /** RFC 3339 date-time, kept exactly as received. */
  timestamp: string;
  transport: Transport;
  direction: Direction;
  ocppVersion?: string;
  chargePointId?: string;
  /** Integer, `0` or greater. */
  connectorId?: number;
  messageId?: string;
  /** Decoded OCPP payload; any JSON value. */
  payload?: unknown;
  /** Original wire message, kept exactly as received. */
  raw?: string;
  /** Producer-specific extensions, preserved intact. */
  meta?: Record<string, unknown>;
}

/** A request: `action` is required and `error` is absent. */
export interface CallRecord extends TraceRecordFields {
  messageType: "CALL";
  action: string;
  error?: never;
}

/** A successful response: `error` is absent. */
export interface CallResultRecord extends TraceRecordFields {
  messageType: "CALLRESULT";
  action?: string;
  error?: never;
}

/** An error response: `error` is required. */
export interface CallErrorRecord extends TraceRecordFields {
  messageType: "CALLERROR";
  action?: string;
  error: TraceError;
}

/** One Open OCPP Trace record, discriminated by `messageType`. */
export type TraceRecord = CallRecord | CallResultRecord | CallErrorRecord;
