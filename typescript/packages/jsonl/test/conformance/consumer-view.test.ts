// Consumer conformance: every fixture read through `readRecords`, and every
// fixture written by the writer then read back, derives exactly the
// consumer view of its `expected.json`.

import { describe, expect, it } from "vite-plus/test";

import type { TraceRecord } from "@open-ocpp-trace/core";

import {
  fixtureTraces,
  manifestPaths,
  readCorpusBytes,
  readCorpusFile,
} from "../../../core/test/support/corpus.ts";
import { callResult, fullCall } from "../../../core/test/support/records.ts";
import { readRecords } from "../../src/reader/index.ts";
import { serializeRecords } from "../../src/writer/index.ts";
import { collect, utf8 } from "../support/chunks.ts";
import { consumerView } from "./consumer-view.ts";

interface Fixture {
  readonly name: string;
  readonly tracePath: string;
  readonly expectedPath: string;
}

/** Every fixture of the manifest, each trace paired with its listed `expected.json`. */
function fixtures(): Fixture[] {
  const listed = new Set(manifestPaths());
  return fixtureTraces().map(({ name, path: tracePath }) => {
    const expectedPath = tracePath.replace(/trace\.jsonl$/, "expected.json");
    if (!listed.has(expectedPath)) {
      throw new Error(`${expectedPath} is not listed in the manifest next to ${tracePath}`);
    }
    return { name, tracePath, expectedPath };
  });
}

const FIXTURES = fixtures();

describe("consumer view of the conformance corpus", () => {
  it("lists fixtures in the manifest", () => {
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  describe.each(FIXTURES.map((fixture) => [fixture.name, fixture] as const))("%s", (_, fixture) => {
    const expected: unknown = JSON.parse(readCorpusFile(fixture.expectedPath));
    const bytes = readCorpusBytes(fixture.tracePath);

    it("matches expected.json from the records readRecords returns", async () => {
      const records = await collect(readRecords([bytes]));
      expect(consumerView(records)).toStrictEqual(expected);
    });

    it("matches expected.json after a write then read round trip", async () => {
      const original = await collect(readRecords([bytes]));
      const written = (await collect(serializeRecords(original))).join("");
      const reread = await collect(readRecords([utf8(written)]));
      expect(consumerView(reread)).toStrictEqual(expected);
    });
  });
});

// Each condition of the correlation rule on its own, since a fixture may
// exercise several at once or none.
describe("consumerView correlation rule", () => {
  const call = (messageId: string, direction = "cp-to-csms", action = "Heartbeat") =>
    ({ ...fullCall(), messageId, direction, action }) as unknown as TraceRecord;
  const response = (messageId: string, direction = "csms-to-cp", extra = {}) =>
    ({ ...callResult(), messageId, direction, ...extra }) as unknown as TraceRecord;

  it("does not correlate a response with another messageId", () => {
    const view = consumerView([call("a"), response("b")]);
    expect(view.unansweredCalls).toEqual([0]);
    expect(view.orphanResponses).toEqual([1]);
  });

  it("does not correlate a response travelling in the same direction as the CALL", () => {
    const view = consumerView([call("a"), response("a", "cp-to-csms")]);
    expect(view.records[1]).toStrictEqual({ index: 1, messageType: "CALLRESULT", messageId: "a" });
    expect(view.unansweredCalls).toEqual([0]);
    expect(view.orphanResponses).toEqual([1]);
  });

  it("does not correlate a second response with an answered CALL", () => {
    const view = consumerView([call("a"), response("a"), response("a")]);
    expect(view.records[1]).toMatchObject({ correlatesWith: 0 });
    expect(view.records[2]).not.toHaveProperty("correlatesWith");
    expect(view.orphanResponses).toEqual([2]);
  });

  it("does not correlate a response with a CALL that follows it", () => {
    const view = consumerView([response("a"), call("a")]);
    expect(view.records[0]).not.toHaveProperty("correlatesWith");
    expect(view.orphanResponses).toEqual([0]);
    expect(view.unansweredCalls).toEqual([1]);
  });

  it("correlates with the most recent unanswered matching CALL", () => {
    const view = consumerView([
      call("a", "cp-to-csms", "First"),
      call("a", "cp-to-csms", "Second"),
      response("a"),
      response("a"),
    ]);
    expect(view.records[2]).toMatchObject({ action: "Second", correlatesWith: 1 });
    expect(view.records[3]).toMatchObject({ action: "First", correlatesWith: 0 });
    expect(view.unansweredCalls).toEqual([]);
  });

  // conformance/README.md: « an orphan response has no effective action
  // unless its record carries one explicitly ». The corpus's only orphan
  // has no action, so this case is pinned here.
  it("keeps the explicit action of an orphan response", () => {
    const view = consumerView([response("z", "csms-to-cp", { action: "Reset" })]);
    expect(view.records[0]).toStrictEqual({
      index: 0,
      messageType: "CALLRESULT",
      messageId: "z",
      action: "Reset",
    });
  });
});
