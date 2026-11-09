// Edge cases from issue #9 that the reader and writer unit tests leave
// open: the version policy seen through the reader, extensions and raw
// frames through a write then read, and line numbers in throw mode after
// blank lines and mixed failures. Invalid inputs are inline on purpose.

import { describe, expect, it } from "vite-plus/test";

import { callError, callResult, fullCall } from "../../core/test/support/records.ts";
import { JsonlReadError, readRecords, type ReadResult } from "../src/reader/index.ts";
import { serializeRecords } from "../src/writer/index.ts";
import { chunksOf, concat, randomChunks, seededRandom, utf8 } from "./support/chunks.ts";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

/** The first error `readRecords` throws in throw mode, with the records read before it. */
async function firstError(
  chunks: ReadonlyArray<string | Uint8Array>,
): Promise<{ readonly records: unknown[]; readonly error: JsonlReadError }> {
  const records: unknown[] = [];
  try {
    for await (const record of readRecords(chunks)) records.push(record);
  } catch (error) {
    if (error instanceof JsonlReadError) return { records, error };
    throw error;
  }
  throw new Error("readRecords did not throw");
}

const line = (record: unknown) => `${JSON.stringify(record)}\n`;
const versioned = (schemaVersion: string) => ({ ...fullCall(), schemaVersion });

describe("schemaVersion through readRecords", () => {
  it("reads any 1.<minor> record and keeps its version as written", async () => {
    const versions = ["1.0", "1.1", "1.9", "1.42"];
    const records = await collect(readRecords([versions.map(versioned).map(line).join("")]));
    expect(records.map((record) => record.schemaVersion)).toEqual(versions);
  });

  it.each([
    ["2.0", "unsupported-version"],
    ["0.9", "unsupported-version"],
    ["v1.1", "format"],
    ["1", "format"],
    ["1.1.0", "format"],
  ])("rejects %j as a validation error on its line (%s)", async (schemaVersion, code) => {
    const input = `${line(versioned("1.1"))}\n${line(versioned(schemaVersion))}${line(callResult())}`;

    const thrown = await firstError([input]);
    expect(thrown.records).toHaveLength(1);
    expect(thrown.error).toMatchObject({ line: 3, kind: "validation" });
    expect(thrown.error.issues).toEqual([
      expect.objectContaining({ path: "/schemaVersion", code }),
    ]);

    const items = await collect(readRecords([input], { onError: "yield" }));
    expect(items.map((item) => (item.ok ? item.line : [item.error.kind, item.error.line]))).toEqual(
      [1, ["validation", 3], 4],
    );
  });

  it("reports a missing schemaVersion as required", async () => {
    const { schemaVersion: _version, ...unversioned } = fullCall();
    const thrown = await firstError([line(unversioned)]);
    expect(thrown.error.issues).toEqual([
      expect.objectContaining({ path: "/schemaVersion", code: "required" }),
    ]);
  });
});

describe("extensions and raw frames through write then read", () => {
  const bs = "\\";
  // A frame as received, with the JSON escapes a peer may send: an escaped
  // quote, an escaped backslash, \u escapes for an accented letter and an
  // astral character, an escaped LF and tab, and literal non-ASCII text.
  const RAW_CALL = `[2,"id-é","DataTransfer",{"data":"q${bs}"x${bs}${bs}y${bs}u00e9${bs}ud83d${bs}ude00${bs}n${bs}t été 😀 中文"}]`;
  const RAW_ERROR = `[4,"id-é","GenericError","échec ${bs}"x${bs}"",{"détail":"${bs}u2028"}]`;
  /** What RAW_CALL's payload decodes to. */
  const PAYLOAD = { data: `q"x${bs}yé😀\n\t été 😀 中文` };

  const RECORDS = [
    {
      ...fullCall(),
      schemaVersion: "1.9",
      messageId: "id-é",
      action: "DataTransfer",
      payload: PAYLOAD,
      raw: RAW_CALL,
      meta: { producer: "édition", tags: ["a", { nested: [null, true, 1.5] }] },
      "x-future-field": { kept: "verbatim", list: [1, "deux"] },
    },
    {
      ...callError(),
      schemaVersion: "1.9",
      direction: "csms-to-cp",
      messageId: "id-é",
      error: {
        code: "GenericError",
        description: 'échec "x"',
        details: { détail: String.fromCharCode(0x2028) },
        vendorCode: 42,
      },
      raw: RAW_ERROR,
      meta: { capture: { file: "trace-é.pcap", frame: 7 } },
      futureTopLevel: null,
    },
  ];

  const written = async () => (await collect(serializeRecords(RECORDS))).join("");

  it.each([
    ["whole text", (text: string) => [text]],
    ["1-byte chunks", (text: string) => chunksOf(utf8(text), 1)],
    ["random byte chunks", (text: string) => randomChunks(utf8(text), seededRandom(0x9e), 5)],
    ["1-char string chunks", (text: string) => chunksOf(text, 1)],
  ])("reads back every field as written from %s", async (_, chunk) => {
    const records = await collect(readRecords(chunk(await written())));
    expect(records).toStrictEqual(RECORDS);
    expect(records.map((record) => Object.keys(record))).toEqual(
      RECORDS.map((record) => Object.keys(record)),
    );
  });

  it("keeps raw as the exact frame text, escapes included", async () => {
    const [call, error] = await collect(readRecords([utf8(await written())]));
    expect(call?.raw).toBe(RAW_CALL);
    expect(error?.raw).toBe(RAW_ERROR);
    // The escapes stay escapes in raw and still decode to the payload.
    expect(JSON.parse(call?.raw ?? "")).toEqual([2, "id-é", "DataTransfer", PAYLOAD]);
  });
});

describe("line numbers in throw mode", () => {
  const ok = (id: string) => line({ ...callResult(), messageId: id });

  it("counts blank, whitespace-only and CRLF lines before the first error", async () => {
    const input = `${ok("1")}\r\n\r\n \t\n${ok("2").replace("\n", "\r\n")}\n{"broken":\n${ok("3")}`;
    for (const chunks of [[input], chunksOf(input, 1), chunksOf(utf8(input), 1)]) {
      const thrown = await firstError(chunks);
      expect(thrown.records).toHaveLength(2);
      expect(thrown.error).toMatchObject({ line: 7, kind: "json" });
    }
  });

  // One stream with several failures: yield mode numbers each of them, and
  // throw mode stops at the first one with the same number, whatever the
  // chunking.
  const { action: _action, ...withoutAction } = fullCall();
  const MIXED = concat(
    utf8(`\r\n${ok("1")}\n`),
    utf8(`${line(withoutAction)}`),
    utf8(`{"pad":"${"x".repeat(2000)}"}\r\n`),
    utf8("\r\n"),
    utf8('{"a":"'),
    new Uint8Array([0xff]),
    utf8('"}\n'),
    utf8(`${ok("2")}\n`),
    utf8("[1,2]\n"),
    utf8(`${ok("3")}`),
    utf8('{"unterminated"'),
  );
  const EXPECTED: ReadonlyArray<readonly [string, number]> = [
    ["ok", 2],
    ["validation", 4],
    ["line-too-long", 5],
    ["encoding", 7],
    ["ok", 8],
    ["validation", 10],
    ["ok", 11],
    ["json", 12],
  ];
  const summary = (item: ReadResult) =>
    item.ok ? ["ok", item.line] : [item.error.kind, item.error.line];

  it.each([
    ["whole", [MIXED]],
    ["1-byte chunks", chunksOf(MIXED, 1)],
    ["random chunks", randomChunks(MIXED, seededRandom(0x11e), 9)],
  ] as const)("agrees with yield mode on every error line (%s)", async (_, chunks) => {
    const items = await collect(readRecords(chunks, { onError: "yield", maxLineBytes: 1024 }));
    expect(items.map(summary)).toEqual(EXPECTED);

    const records: unknown[] = [];
    await expect(
      (async () => {
        for await (const record of readRecords(chunks, { maxLineBytes: 1024 })) {
          records.push(record);
        }
      })(),
    ).rejects.toMatchObject({ line: 4, kind: "validation" });
    expect(records).toHaveLength(1);
  });

  it("reports an error on a final line without newline with its number", async () => {
    const thrown = await firstError([`${ok("1")}\r\n\r\n{"x":`]);
    expect(thrown.error).toMatchObject({ line: 4, kind: "json" });
  });
});
