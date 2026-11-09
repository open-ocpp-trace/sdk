import { describe, expect, it } from "vite-plus/test";

import { JsonlReadError } from "../../src/reader/errors.ts";
import {
  DEFAULT_MAX_LINE_BYTES,
  LineSplitter,
  type LineEvent,
} from "../../src/reader/line-splitter.ts";
import {
  BOM,
  chunksOf,
  concat,
  LS,
  NBSP,
  randomChunks,
  seededRandom,
  utf8,
} from "../support/chunks.ts";

type Summary = { line: number; text: string } | { line: number; error: string };

function summarize(event: LineEvent): Summary {
  return event.type === "line"
    ? { line: event.line, text: event.text }
    : { line: event.error.line, error: event.error.kind };
}

function split(
  chunks: Iterable<string | Uint8Array>,
  options?: { maxLineBytes?: number },
): Summary[] {
  const splitter = new LineSplitter(options);
  const events: LineEvent[] = [];
  for (const chunk of chunks) events.push(...splitter.push(chunk));
  events.push(...splitter.end());
  return events.map(summarize);
}

const TEXT = '{"a":1}\n{"b":"é€😀"}\r\n\n   \t\r\n{"c":3}';
const EXPECTED: Summary[] = [
  { line: 1, text: '{"a":1}' },
  { line: 2, text: '{"b":"é€😀"}' },
  { line: 5, text: '{"c":3}' },
];

describe("LineSplitter framing", () => {
  it("splits on LF and CRLF, skips blank lines but counts them, keeps a final line without newline", () => {
    expect(split([TEXT])).toEqual(EXPECTED);
    expect(split([utf8(TEXT)])).toEqual(EXPECTED);
  });

  it("does not count a trailing newline as an extra line", () => {
    expect(split(["a\nb\n"])).toEqual([
      { line: 1, text: "a" },
      { line: 2, text: "b" },
    ]);
    expect(split(["a\r\n"])).toEqual([{ line: 1, text: "a" }]);
  });

  it("keeps a lone CR that is not followed by LF", () => {
    expect(split(["a\rb\n"])).toEqual([{ line: 1, text: "a\rb" }]);
  });

  it("treats only JSON whitespace as blank", () => {
    expect(split([`${NBSP}\n \t\r\n${LS}`])).toEqual([
      { line: 1, text: NBSP },
      { line: 3, text: LS },
    ]);
  });

  it("yields nothing for an empty stream or empty chunks", () => {
    expect(split([])).toEqual([]);
    expect(split(["", new Uint8Array(0)])).toEqual([]);
  });

  it("handles one-unit chunks of text and bytes", () => {
    expect(split(chunksOf(TEXT, 1))).toEqual(EXPECTED);
    expect(split(chunksOf(utf8(TEXT), 1))).toEqual(EXPECTED);
  });

  it("handles random chunk sizes over the same input", () => {
    const bytes = utf8(TEXT);
    const random = seededRandom(7);
    for (let round = 0; round < 200; round += 1) {
      expect(split(randomChunks(bytes, random, 12))).toEqual(EXPECTED);
      expect(split(randomChunks(TEXT, random, 12))).toEqual(EXPECTED);
    }
  });
});

describe("LineSplitter UTF-8 decoding", () => {
  // 2-, 3- and 4-byte sequences, split at every offset of the stream.
  for (const char of ["é", "€", "😀"]) {
    it(`decodes ${char} (${utf8(char).length} bytes) split at every offset`, () => {
      const text = `{"v":"${char}"}\n{"w":"${char}${char}"}`;
      const bytes = utf8(text);
      for (let cut = 0; cut <= bytes.length; cut += 1) {
        for (let second = cut; second <= bytes.length; second += 1) {
          const chunks = [bytes.slice(0, cut), bytes.slice(cut, second), bytes.slice(second)];
          expect(split(chunks)).toEqual([
            { line: 1, text: `{"v":"${char}"}` },
            { line: 2, text: `{"w":"${char}${char}"}` },
          ]);
        }
      }
    });
  }

  it("reports invalid UTF-8 as an encoding error on the line that holds it", () => {
    const bytes = concat(utf8("l1\nl2\nl3"), new Uint8Array([0xff]), utf8("x\nl4\n"));
    expect(split([bytes])).toEqual([
      { line: 1, text: "l1" },
      { line: 2, text: "l2" },
      { line: 3, error: "encoding" },
      { line: 4, text: "l4" },
    ]);
    expect(split(chunksOf(bytes, 1))).toEqual(split([bytes]));
  });

  it("reports a multibyte sequence cut by LF or by the end of the stream", () => {
    const euro = utf8("€");
    const cutByLf = concat(euro.slice(0, 2), utf8("\nok\n"));
    expect(split([cutByLf])).toEqual([
      { line: 1, error: "encoding" },
      { line: 2, text: "ok" },
    ]);
    expect(split([utf8("ok\n"), euro.slice(0, 2)])).toEqual([
      { line: 1, text: "ok" },
      { line: 2, error: "encoding" },
    ]);
  });

  it("keeps the encoding error's cause and a message naming the line", () => {
    const splitter = new LineSplitter();
    const [event] = [...splitter.push(new Uint8Array([0xc3, 0x28])), ...splitter.end()];
    expect(event?.type).toBe("error");
    const error = event?.type === "error" ? event.error : undefined;
    expect(error).toBeInstanceOf(JsonlReadError);
    expect(error?.message).toMatch(/^Line 1: /);
    expect(error?.cause).toBeInstanceOf(TypeError);
  });
});

describe("LineSplitter byte order mark", () => {
  const BOM_BYTES = new Uint8Array([0xef, 0xbb, 0xbf]);

  it("strips a BOM at the start of a byte stream, even split across chunks", () => {
    const bytes = concat(BOM_BYTES, utf8("a\nb"));
    const expected = [
      { line: 1, text: "a" },
      { line: 2, text: "b" },
    ];
    expect(split([bytes])).toEqual(expected);
    expect(split(chunksOf(bytes, 1))).toEqual(expected);
    expect(split([new Uint8Array(0), bytes.slice(0, 2), bytes.slice(2)])).toEqual(expected);
  });

  it("strips a BOM at the start of a text stream", () => {
    expect(split(["", `${BOM}a\nb`])).toEqual([
      { line: 1, text: "a" },
      { line: 2, text: "b" },
    ]);
  });

  it("keeps a BOM that is not at the start of the stream", () => {
    expect(split([concat(utf8("a\n"), BOM_BYTES, utf8("b"))])).toEqual([
      { line: 1, text: "a" },
      { line: 2, text: `${BOM}b` },
    ]);
    expect(split([`a\n${BOM}b`])).toEqual([
      { line: 1, text: "a" },
      { line: 2, text: `${BOM}b` },
    ]);
  });

  it("decodes a BOM prefix that turns out not to be a BOM", () => {
    expect(split([new Uint8Array([0xef, 0xbb]), utf8("a")])).toEqual([
      { line: 1, error: "encoding" },
    ]);
    expect(split([new Uint8Array([0xef])])).toEqual([{ line: 1, error: "encoding" }]);
  });

  it("does not count the BOM towards the first line's size", () => {
    expect(split([concat(BOM_BYTES, utf8("abcd"))], { maxLineBytes: 4 })).toEqual([
      { line: 1, text: "abcd" },
    ]);
  });
});

describe("LineSplitter maxLineBytes", () => {
  it("defaults to 1 MiB", () => {
    expect(DEFAULT_MAX_LINE_BYTES).toBe(1024 * 1024);
    const atLimit = "x".repeat(DEFAULT_MAX_LINE_BYTES);
    expect(split([atLimit])).toEqual([{ line: 1, text: atLimit }]);
    expect(split([`${atLimit}x`])).toEqual([{ line: 1, error: "line-too-long" }]);
  });

  for (const [name, terminator] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
  ] as const) {
    it(`accepts a line of exactly maxLineBytes and rejects one more byte (${name})`, () => {
      const input = `abcd${terminator}abcde${terminator}ok`;
      const expected = [
        { line: 1, text: "abcd" },
        { line: 2, error: "line-too-long" },
        { line: 3, text: "ok" },
      ];
      expect(split([input], { maxLineBytes: 4 })).toEqual(expected);
      expect(split(chunksOf(utf8(input), 1), { maxLineBytes: 4 })).toEqual(expected);
    });
  }

  it("applies the same bound to a final line without newline, a lone CR included", () => {
    for (const chunks of [(s: string) => [s], (s: string) => chunksOf(utf8(s), 1)]) {
      expect(split(chunks("ok\nabcd"), { maxLineBytes: 4 })).toEqual([
        { line: 1, text: "ok" },
        { line: 2, text: "abcd" },
      ]);
      expect(split(chunks("ok\nabcde"), { maxLineBytes: 4 })).toEqual([
        { line: 1, text: "ok" },
        { line: 2, error: "line-too-long" },
      ]);
      expect(split(chunks("ok\nabcd\r"), { maxLineBytes: 4 })).toEqual([
        { line: 1, text: "ok" },
        { line: 2, error: "line-too-long" },
      ]);
    }
  });

  it("measures the limit in UTF-8 bytes, not in UTF-16 code units", () => {
    // "é€😀" is 4 code units and 2 + 3 + 4 = 9 bytes.
    for (const input of ["é€😀", utf8("é€😀")]) {
      expect(split([input], { maxLineBytes: 9 })).toEqual([{ line: 1, text: "é€😀" }]);
      expect(split([input], { maxLineBytes: 8 })).toEqual([{ line: 1, error: "line-too-long" }]);
    }
  });

  it("counts a CR inside a line", () => {
    expect(split(["ab\rc\n"], { maxLineBytes: 3 })).toEqual([{ line: 1, error: "line-too-long" }]);
  });

  it("reports an oversized line as soon as the limit is crossed, before its end", () => {
    const splitter = new LineSplitter({ maxLineBytes: 8 });
    expect([...splitter.push("0123456")]).toEqual([]);
    const [event] = [...splitter.push("789")];
    expect(event?.type === "error" && event.error.kind).toBe("line-too-long");
    expect([...splitter.push("more of the same line")]).toEqual([]);
    expect([...splitter.push("\nnext")].map(summarize)).toEqual([]);
    expect([...splitter.end()].map(summarize)).toEqual([{ line: 2, text: "next" }]);
  });

  it("never buffers more than maxLineBytes + 1 (a pending CR) while skipping an oversized line", () => {
    const maxLineBytes = 1000;
    for (const piece of ["x".repeat(37), utf8("é".repeat(37)), "\r".repeat(37)]) {
      const splitter = new LineSplitter({ maxLineBytes });
      let maxBuffered = 0;
      let errors = 0;
      for (let pushed = 0; pushed < 50 * maxLineBytes; pushed += piece.length) {
        for (const event of splitter.push(piece)) {
          if (event.type === "error") errors += 1;
        }
        maxBuffered = Math.max(maxBuffered, splitter.bufferedBytes);
      }
      expect(errors).toBe(1);
      expect(maxBuffered).toBeLessThanOrEqual(maxLineBytes + 1);
      const tail = typeof piece === "string" ? "\nok" : utf8("\nok");
      expect([...splitter.push(tail), ...splitter.end()].map(summarize)).toEqual([
        { line: 2, text: "ok" },
      ]);
    }
  });

  it("rejects a limit that is not a positive integer", () => {
    for (const maxLineBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new LineSplitter({ maxLineBytes })).toThrow(RangeError);
    }
  });
});

describe("LineSplitter chunk types", () => {
  it("rejects a byte chunk in a text stream and the reverse", () => {
    const text = new LineSplitter();
    expect([...text.push("a")]).toEqual([]);
    expect(() => [...text.push(utf8("b"))]).toThrow(TypeError);

    const bytes = new LineSplitter();
    expect([...bytes.push(utf8("a"))]).toEqual([]);
    expect(() => [...bytes.push("b")]).toThrow(TypeError);
  });

  it("lets an empty chunk of either type through without fixing the stream type", () => {
    expect(split(["", utf8("a")])).toEqual([{ line: 1, text: "a" }]);
    expect(split([new Uint8Array(0), "a"])).toEqual([{ line: 1, text: "a" }]);
  });

  it("rejects a chunk that is neither a string nor a Uint8Array", () => {
    const splitter = new LineSplitter();
    expect(() => [...splitter.push(42 as unknown as string)]).toThrow(TypeError);
  });
});
