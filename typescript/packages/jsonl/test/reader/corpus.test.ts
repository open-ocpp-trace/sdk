// Reads every conformance fixture through `readRecords`, whatever the
// chunking, and checks that the records are exactly the JSON of each line.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { fixtureTraces, SPECIFICATION_DIR } from "../../../core/test/support/corpus.ts";
import { readRecords } from "../../src/reader/index.ts";
import { chunksOf, randomChunks, seededRandom } from "../support/chunks.ts";

const traces = fixtureTraces();

interface Utf8Decoder {
  decode(input: Uint8Array): string;
}
const { TextDecoder } = globalThis as unknown as { TextDecoder: new () => Utf8Decoder };

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

/** The fixture file as bytes, read directly so that nothing is normalised. */
function bytesOf(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(SPECIFICATION_DIR, path)));
}

/** `bytes` minus one trailing LF, failing if there is none to remove. */
function withoutFinalNewline(bytes: Uint8Array): Uint8Array {
  if (bytes.at(-1) !== 0x0a) throw new Error("fixture does not end with a LF");
  return bytes.subarray(0, -1);
}

describe("conformance corpus through readRecords", () => {
  it("lists fixtures in the manifest", () => {
    expect(traces.length).toBeGreaterThan(0);
  });

  describe.each(traces.map((trace) => [trace.name, trace] as const))("%s", (_, trace) => {
    const bytes = bytesOf(trace.path);
    const text = new TextDecoder().decode(bytes);
    const expected: unknown[] = trace.lines.map((line) => JSON.parse(line.text) as unknown);

    const chunkings: ReadonlyArray<readonly [string, ReadonlyArray<string | Uint8Array>]> = [
      ["whole", [bytes]],
      ["1-byte chunks", chunksOf(bytes, 1)],
      ["seeded random byte chunks", randomChunks(bytes, seededRandom(0x7ace), 64)],
      ["seeded random string chunks", randomChunks(text, seededRandom(0x7ace), 64)],
      ["1-char string chunks", chunksOf(text, 1)],
      // Every fixture ends with a LF; also read it without, so that the
      // final unterminated line is covered on real data.
      ["bytes without the final newline", [withoutFinalNewline(bytes)]],
    ];

    it.each(chunkings)("reads %s as the JSON of every non-empty line", async (_, chunks) => {
      const records = await collect(readRecords(chunks));
      expect(records).toHaveLength(trace.lines.length);
      expect(records).toStrictEqual(expected);
    });

    it("yields a successful result per non-empty line, with its line number", async () => {
      const results = await collect(readRecords(chunksOf(bytes, 7), { onError: "yield" }));
      expect(results).toStrictEqual(
        trace.lines.map((line, index) => ({
          ok: true,
          record: expected[index],
          line: line.number,
        })),
      );
    });
  });
});
