import { describe, expect, it } from "vite-plus/test";

import { SCHEMA_VERSION } from "../src/index.ts";

describe("SCHEMA_VERSION", () => {
  it("is the format version the package writes", () => {
    expect(SCHEMA_VERSION).toBe("1.1");
  });
});
