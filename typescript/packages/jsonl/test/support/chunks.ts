// Test helpers for building chunked inputs. The workspace compiles without
// DOM or Node types, so `TextEncoder` is reached through `globalThis` with a
// minimal local type, as the reader does for `TextDecoder`.

interface Utf8Encoder {
  encode(input: string): Uint8Array;
}

const { TextEncoder } = globalThis as unknown as { TextEncoder: new () => Utf8Encoder };
const encoder = new TextEncoder();

// Invisible characters, spelled by code point so that they stay visible in
// the sources.
/** U+FEFF, the byte order mark. */
export const BOM: string = String.fromCharCode(0xfeff);
/** U+00A0, a no-break space: whitespace for `trim()`, not for JSON. */
export const NBSP: string = String.fromCharCode(0xa0);
/** U+2028, a line separator: not a JSONL line terminator. */
export const LS: string = String.fromCharCode(0x2028);

/** UTF-8 bytes of `text`. */
export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Concatenates byte arrays. */
export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Splits `input` into chunks of `size` units (the last one may be shorter). */
export function chunksOf<T extends string | Uint8Array>(input: T, size: number): T[] {
  const chunks: T[] = [];
  for (let offset = 0; offset < input.length; offset += size) {
    chunks.push(input.slice(offset, offset + size) as T);
  }
  return chunks;
}

/** Deterministic PRNG (mulberry32) so that random chunkings are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `input` into chunks of random sizes between 1 and `maxSize`. */
export function randomChunks<T extends string | Uint8Array>(
  input: T,
  random: () => number,
  maxSize: number,
): T[] {
  const chunks: T[] = [];
  let offset = 0;
  while (offset < input.length) {
    const size = 1 + Math.floor(random() * maxSize);
    chunks.push(input.slice(offset, offset + size) as T);
    offset += size;
  }
  return chunks;
}
