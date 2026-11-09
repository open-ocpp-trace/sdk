import { SCHEMA_VERSION as CORE_SCHEMA_VERSION } from "@open-ocpp-trace/core";
import { describe, expect, it } from "vite-plus/test";

import { SCHEMA_VERSION } from "../src/index.ts";

describe("SCHEMA_VERSION", () => {
  it("is the version defined by core", () => {
    expect(SCHEMA_VERSION).toBe(CORE_SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe("1.1");
  });
});
