import { JsonlReadError } from "./errors.ts";

/** Default bound on the size of one line: 1 MiB of UTF-8. */
export const DEFAULT_MAX_LINE_BYTES: number = 1024 * 1024;

/** A complete, non-blank line, or a line that cannot be read. */
export type LineEvent =
  | { readonly type: "line"; readonly line: number; readonly text: string }
  | { readonly type: "error"; readonly error: JsonlReadError };

export interface LineSplitterOptions {
  /**
   * Largest accepted line, in UTF-8 bytes, excluding its LF or CRLF
   * terminator and a stream-initial BOM. Defaults to 1 MiB.
   */
  readonly maxLineBytes?: number;
}

// `TextDecoder` exists in browsers, Node.js, Bun and Deno, but the ES lib
// does not declare it and this package compiles without DOM or Node types.
// It is reached through `globalThis` with the two members used here, so no
// global declaration leaks into the published types.
interface Utf8Decoder {
  decode(input?: Uint8Array, options?: { stream?: boolean }): string;
}
type Utf8DecoderConstructor = new (
  label: "utf-8",
  options: { fatal: boolean; ignoreBOM: boolean },
) => Utf8Decoder;

function createDecoder(): Utf8Decoder {
  const { TextDecoder } = globalThis as unknown as { TextDecoder?: Utf8DecoderConstructor };
  if (typeof TextDecoder !== "function") {
    throw new TypeError("Reading Uint8Array chunks requires a global TextDecoder");
  }
  // The BOM is handled by the splitter, at stream start only; a decoder
  // with `ignoreBOM: false` would strip one at the start of every line.
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
}

const LF = 0x0a;
const CR = 0x0d;
const BOM_BYTES = [0xef, 0xbb, 0xbf] as const;
const BOM_CHAR = 0xfeff;
const BLANK = /^[ \t\r]*$/;

/** UTF-8 size of `text[start, end)`; each UTF-16 surrogate counts 2 bytes. */
function utf8Length(text: string, start: number, end: number): number {
  let size = 0;
  for (let index = start; index < end; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) size += 1;
    else if (unit < 0x800 || (unit >= 0xd800 && unit <= 0xdfff)) size += 2;
    else size += 3;
  }
  return size;
}

/**
 * Incremental JSONL line framing over string or `Uint8Array` chunks.
 *
 * - Lines end with LF; a CR right before the LF is removed. A lone CR is
 *   content.
 * - Byte chunks are decoded as UTF-8, a multibyte sequence may span
 *   chunks; invalid UTF-8 is an `encoding` error for the line holding it.
 * - A UTF-8 BOM (`U+FEFF`) is removed at the start of the stream only.
 * - Lines are numbered from 1. Blank lines (only spaces, tabs and CRs) are
 *   counted but not emitted. A final line without LF is emitted by `end()`.
 * - A line longer than `maxLineBytes` is reported as soon as the bound is
 *   crossed and its remaining bytes are discarded up to the next LF, so the
 *   splitter never holds more than `maxLineBytes + 1` bytes (the `+ 1` is a
 *   CR that may still turn out to be part of a CRLF).
 * - One stream is either text or bytes: the first non-empty chunk fixes the
 *   type and a chunk of the other type throws a `TypeError`, as does a chunk
 *   of any other type. Mixing has no use and would make an incomplete
 *   multibyte sequence before a string chunk ambiguous.
 *
 * Events are produced lazily: a consumer that stops iterating `push()`
 * stops the work on that chunk.
 */
export class LineSplitter {
  readonly #maxLineBytes: number;
  #mode: "text" | "bytes" | undefined;
  #decoder: Utf8Decoder | undefined;
  #line = 1;
  #parts: string[] = [];
  #bytes = 0;
  #endsWithCR = false;
  #discarding = false;
  #atStart = true;
  #bomMatched = 0;

  constructor(options: LineSplitterOptions = {}) {
    const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) {
      throw new RangeError(`maxLineBytes must be a positive integer, got ${maxLineBytes}`);
    }
    this.#maxLineBytes = maxLineBytes;
  }

  /** UTF-8 bytes of the current, incomplete line held by the splitter. */
  get bufferedBytes(): number {
    return this.#bytes;
  }

  /** Feeds one chunk and yields the events it completes. */
  *push(chunk: string | Uint8Array): Generator<LineEvent, void, undefined> {
    if (typeof chunk === "string") {
      if (chunk.length === 0) return;
      this.#setMode("text");
      if (this.#atStart) {
        this.#atStart = false;
        if (chunk.charCodeAt(0) === BOM_CHAR) chunk = chunk.slice(1);
      }
      yield* this.#pushText(chunk);
    } else if (chunk instanceof Uint8Array) {
      if (chunk.length === 0) return;
      this.#setMode("bytes");
      if (this.#atStart) yield* this.#pushBytesAtStart(chunk);
      else yield* this.#pushBytes(chunk);
    } else {
      throw new TypeError(`Chunks must be strings or Uint8Arrays, got ${typeof chunk}`);
    }
  }

  /** Ends the stream and yields the events of its last, unterminated line. */
  *end(): Generator<LineEvent, void, undefined> {
    if (this.#atStart && this.#bomMatched > 0) {
      // A BOM prefix cut by the end of the stream is content.
      this.#atStart = false;
      yield* this.#pushBytes(Uint8Array.from(BOM_BYTES.slice(0, this.#bomMatched)));
    }
    if (this.#discarding) return;
    // Without a LF, a trailing CR is a lone CR and counts as content.
    if (this.#bytes > this.#maxLineBytes) {
      yield this.#fail("line-too-long", `line exceeds maxLineBytes (${this.#maxLineBytes})`);
      return;
    }
    const event = this.#completeLine(false);
    if (event !== undefined) yield event;
  }

  #setMode(mode: "text" | "bytes"): void {
    if (this.#mode === undefined) this.#mode = mode;
    else if (this.#mode !== mode) {
      throw new TypeError("A stream cannot mix string and Uint8Array chunks");
    }
  }

  *#pushBytesAtStart(chunk: Uint8Array): Generator<LineEvent, void, undefined> {
    let index = 0;
    while (index < chunk.length && this.#bomMatched < BOM_BYTES.length) {
      if (chunk[index] !== BOM_BYTES[this.#bomMatched]) {
        // Not a BOM: replay the prefix matched so far as content.
        this.#atStart = false;
        const prefix = Uint8Array.from(BOM_BYTES.slice(0, this.#bomMatched));
        this.#bomMatched = 0;
        yield* this.#pushBytes(prefix);
        yield* this.#pushBytes(chunk.subarray(index));
        return;
      }
      this.#bomMatched += 1;
      index += 1;
    }
    if (this.#bomMatched === BOM_BYTES.length) {
      this.#atStart = false;
      yield* this.#pushBytes(chunk.subarray(index));
    }
  }

  *#pushText(text: string): Generator<LineEvent, void, undefined> {
    let start = 0;
    while (start < text.length) {
      const lf = text.indexOf("\n", start);
      const end = lf === -1 ? text.length : lf;
      if (!this.#discarding && end > start) {
        const size = this.#bytes + utf8Length(text, start, end);
        const endsWithCR = text.charCodeAt(end - 1) === CR;
        if (this.#exceeds(size, endsWithCR)) {
          yield this.#fail("line-too-long", `line exceeds maxLineBytes (${this.#maxLineBytes})`);
        } else {
          this.#parts.push(text.slice(start, end));
          this.#bytes = size;
          this.#endsWithCR = endsWithCR;
        }
      }
      if (lf === -1) return;
      const event = this.#completeLine(true);
      if (event !== undefined) yield event;
      start = lf + 1;
    }
  }

  *#pushBytes(chunk: Uint8Array): Generator<LineEvent, void, undefined> {
    let start = 0;
    while (start < chunk.length) {
      const lf = chunk.indexOf(LF, start);
      const end = lf === -1 ? chunk.length : lf;
      if (!this.#discarding && end > start) {
        const size = this.#bytes + (end - start);
        const endsWithCR = chunk[end - 1] === CR;
        if (this.#exceeds(size, endsWithCR)) {
          yield this.#fail("line-too-long", `line exceeds maxLineBytes (${this.#maxLineBytes})`);
        } else {
          let text: string | undefined;
          try {
            this.#decoder ??= createDecoder();
            text = this.#decoder.decode(chunk.subarray(start, end), { stream: true });
          } catch (cause) {
            yield this.#fail("encoding", "invalid UTF-8", cause);
          }
          if (text !== undefined) {
            if (text.length > 0) this.#parts.push(text);
            this.#bytes = size;
            this.#endsWithCR = endsWithCR;
          }
        }
      }
      if (lf === -1) return;
      const event = this.#completeLine(true);
      if (event !== undefined) yield event;
      start = lf + 1;
    }
  }

  /** Whether a line of `size` bytes so far is already over the bound. */
  #exceeds(size: number, endsWithCR: boolean): boolean {
    const allowance = endsWithCR ? 1 : 0;
    return size > this.#maxLineBytes + allowance;
  }

  /** Closes the current line (at a LF or at the end of the stream). */
  #completeLine(atLf: boolean): LineEvent | undefined {
    const line = this.#line;
    if (atLf) this.#line += 1;
    if (this.#discarding) {
      this.#discarding = false;
      return undefined;
    }
    let tail = "";
    if (this.#decoder !== undefined) {
      try {
        tail = this.#decoder.decode();
      } catch (cause) {
        const event = this.#fail("encoding", "invalid UTF-8", cause, line);
        this.#discarding = false;
        return event;
      }
    }
    let text = this.#parts.join("") + tail;
    if (atLf && this.#endsWithCR) text = text.slice(0, -1);
    this.#reset();
    return BLANK.test(text) ? undefined : { type: "line", line, text };
  }

  /** Reports the current line as unreadable and discards it up to the next LF. */
  #fail(
    kind: "line-too-long" | "encoding",
    detail: string,
    cause?: unknown,
    line: number = this.#line,
  ): LineEvent {
    this.#reset();
    this.#decoder = undefined;
    this.#discarding = true;
    const init = cause === undefined ? { line, kind, detail } : { line, kind, detail, cause };
    return { type: "error", error: new JsonlReadError(init) };
  }

  #reset(): void {
    this.#parts = [];
    this.#bytes = 0;
    this.#endsWithCR = false;
  }
}
