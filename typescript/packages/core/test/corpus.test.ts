import { describe, expect, it } from "vite-plus/test";

import { validateRecord } from "../src/index.ts";
import { fixtureTraces } from "./support/corpus.ts";

const traces = fixtureTraces();

describe("conformance corpus", () => {
  it("lists fixtures in the manifest", () => {
    expect(traces.length).toBeGreaterThan(0);
    for (const trace of traces) expect(trace.lines.length, trace.path).toBeGreaterThan(0);
  });

  describe.each(traces.map((trace) => [trace.name, trace] as const))("%s", (_, trace) => {
    it.each(trace.lines.map((line) => [line.number, line.text] as const))(
      "line %i is a valid record, returned as is",
      (_, text) => {
        const input: unknown = JSON.parse(text);
        const result = validateRecord(input);
        expect(result).toEqual({ ok: true, record: input });
        if (result.ok) expect(result.record).toBe(input);
      },
    );
  });
});
