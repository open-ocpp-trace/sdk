// Runs in a throwaway project that installed the packed tarballs, under
// Node.js and under Bun. Imports every public entry point the way a
// consumer does, then writes and reads one record back.

import assert from "node:assert/strict";

import * as core from "@open-ocpp-trace/core";
import * as jsonl from "@open-ocpp-trace/jsonl";
import * as reader from "@open-ocpp-trace/jsonl/reader";
import * as writer from "@open-ocpp-trace/jsonl/writer";

const ENTRY_POINTS = {
  "@open-ocpp-trace/core": [
    core,
    [
      "DIRECTIONS",
      "MESSAGE_TYPES",
      "TRANSPORTS",
      "SCHEMA_VERSION",
      "SUPPORTED_SCHEMA_MAJOR",
      "isSupportedSchemaVersion",
      "validateRecord",
      "assertRecord",
      "TraceValidationError",
    ],
  ],
  "@open-ocpp-trace/jsonl/reader": [reader, ["readRecords", "parseRecord", "JsonlReadError"]],
  "@open-ocpp-trace/jsonl/writer": [
    writer,
    ["serializeRecord", "serializeRecords", "writeRecords", "JsonlWriteError"],
  ],
};

for (const [specifier, [module, names]] of Object.entries(ENTRY_POINTS)) {
  for (const name of names) {
    assert.notEqual(module[name], undefined, `${specifier} does not export ${name}`);
  }
}

// The root entry point of jsonl re-exports both subpaths and the schema
// version of core, as the same objects: one class per error, so that
// `instanceof` holds whichever entry point the error class came from.
for (const [specifier, module] of [
  ["@open-ocpp-trace/jsonl/reader", reader],
  ["@open-ocpp-trace/jsonl/writer", writer],
]) {
  for (const [name, value] of Object.entries(module)) {
    assert.equal(jsonl[name], value, `@open-ocpp-trace/jsonl re-exports ${name} of ${specifier}`);
  }
}
assert.equal(jsonl.SCHEMA_VERSION, core.SCHEMA_VERSION);

const record = {
  schemaVersion: core.SCHEMA_VERSION,
  timestamp: "2025-01-15T10:30:00.000Z",
  transport: "json",
  direction: "cp-to-csms",
  messageType: "CALL",
  messageId: "smoke-1",
  action: "Heartbeat",
  payload: {},
  raw: '[2,"smoke-1","Heartbeat",{}]',
};
assert.equal(core.validateRecord(record).ok, true);

const written = [];
const count = await writer.writeRecords([record], { write: (line) => void written.push(line) });
assert.equal(count, 1);

const bytes = new TextEncoder().encode(written.join(""));
const read = [];
for await (const item of reader.readRecords([bytes])) read.push(item);
assert.deepEqual(read, [record]);

await assert.rejects(
  async () => {
    for await (const _ of writer.serializeRecords([{ ...record, transport: "pigeon" }]));
  },
  (error) => error instanceof jsonl.JsonlWriteError,
);

const runtime =
  typeof globalThis.Bun === "undefined"
    ? `node ${process.version}`
    : `bun ${globalThis.Bun.version}`;
console.log(`smoke: ${runtime}: every entry point imported, one record written and read back`);
