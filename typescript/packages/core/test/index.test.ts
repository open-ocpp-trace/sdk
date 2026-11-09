import { describe, expect, it } from "vite-plus/test";

import {
  DIRECTIONS,
  isSupportedSchemaVersion,
  MESSAGE_TYPES,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_MAJOR,
  TRANSPORTS,
} from "../src/index.ts";

describe("SCHEMA_VERSION", () => {
  it("is the format version the package writes", () => {
    expect(SCHEMA_VERSION).toBe("1.1");
  });

  it("belongs to the supported major", () => {
    expect(SUPPORTED_SCHEMA_MAJOR).toBe(1);
    expect(isSupportedSchemaVersion(SCHEMA_VERSION)).toBe(true);
  });
});

describe("enumerations", () => {
  it("list the values of the schema", () => {
    expect(TRANSPORTS).toEqual(["json", "soap"]);
    expect(DIRECTIONS).toEqual(["cp-to-csms", "csms-to-cp"]);
    expect(MESSAGE_TYPES).toEqual(["CALL", "CALLRESULT", "CALLERROR"]);
  });
});

describe("isSupportedSchemaVersion", () => {
  it.each(["1.0", "1.1", "1.42"])("accepts %j", (version) => {
    expect(isSupportedSchemaVersion(version)).toBe(true);
  });

  it.each([
    "2.0",
    "0.9",
    "1",
    "v1.1",
    "",
    "1.",
    ".1",
    "01.1",
    "1.1.0",
    "1.x",
    " 1.1",
    "1.1\n",
    1.1,
    null,
    undefined,
  ])("rejects %j", (version) => {
    expect(isSupportedSchemaVersion(version)).toBe(false);
  });
});
