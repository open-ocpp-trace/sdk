// Valid base records for tests that derive variants from a known-good record.

/** Fields every record carries, with valid values. */
export const BASE_FIELDS = {
  schemaVersion: "1.1",
  timestamp: "2025-01-15T10:30:00.000Z",
  transport: "json",
  direction: "cp-to-csms",
} as const;

/** A valid CALL using every optional field the schema declares except `error`. */
export function fullCall(): Record<string, unknown> {
  return {
    ...BASE_FIELDS,
    messageType: "CALL",
    ocppVersion: "1.6",
    chargePointId: "CP-001",
    connectorId: 1,
    messageId: "msg-1",
    action: "StatusNotification",
    payload: { connectorId: 1, status: "Available", errorCode: "NoError" },
    raw: '[2,"msg-1","StatusNotification",{}]',
    meta: { producer: "test" },
  };
}

/** A valid CALLRESULT. */
export function callResult(): Record<string, unknown> {
  return { ...BASE_FIELDS, messageType: "CALLRESULT", messageId: "msg-1", payload: {} };
}

/** A valid CALLERROR with every `error` field. */
export function callError(): Record<string, unknown> {
  return {
    ...BASE_FIELDS,
    messageType: "CALLERROR",
    messageId: "msg-1",
    error: { code: "NotImplemented", description: "Unknown action", details: { hint: 1 } },
  };
}
