import { describe, expect, it } from "vite-plus/test";

import * as root from "@open-ocpp-trace/jsonl";
import * as reader from "@open-ocpp-trace/jsonl/reader";

describe("reader entry points", () => {
  it("exports the reader API from the reader subpath", () => {
    expect(Object.keys(reader).sort()).toEqual(["JsonlReadError", "parseRecord", "readRecords"]);
  });

  it("re-exports the same objects from the package root", () => {
    expect(root.JsonlReadError).toBe(reader.JsonlReadError);
    expect(root.parseRecord).toBe(reader.parseRecord);
    expect(root.readRecords).toBe(reader.readRecords);
  });
});
