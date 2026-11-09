import { describe, expect, it } from "vite-plus/test";

import * as root from "@open-ocpp-trace/jsonl";
import * as reader from "@open-ocpp-trace/jsonl/reader";
import * as writer from "@open-ocpp-trace/jsonl/writer";

describe("package root", () => {
  it("exports the reader, the writer and SCHEMA_VERSION, nothing else", () => {
    expect(Object.keys(root).sort()).toEqual(
      ["SCHEMA_VERSION", ...Object.keys(reader), ...Object.keys(writer)].sort(),
    );
  });
});

describe("reader entry point", () => {
  it("exports the reader API from the reader subpath", () => {
    expect(Object.keys(reader).sort()).toEqual(["JsonlReadError", "parseRecord", "readRecords"]);
  });

  it("re-exports the same objects from the package root", () => {
    expect(root.JsonlReadError).toBe(reader.JsonlReadError);
    expect(root.parseRecord).toBe(reader.parseRecord);
    expect(root.readRecords).toBe(reader.readRecords);
  });
});

describe("writer entry point", () => {
  it("exports the writer API from the writer subpath", () => {
    expect(Object.keys(writer).sort()).toEqual([
      "JsonlWriteError",
      "serializeRecord",
      "serializeRecords",
      "writeRecords",
    ]);
  });

  it("re-exports the same objects from the package root", () => {
    expect(root.JsonlWriteError).toBe(writer.JsonlWriteError);
    expect(root.serializeRecord).toBe(writer.serializeRecord);
    expect(root.serializeRecords).toBe(writer.serializeRecords);
    expect(root.writeRecords).toBe(writer.writeRecords);
  });
});
