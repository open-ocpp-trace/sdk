# @open-ocpp-trace/jsonl

JSONL reading of [Open OCPP Trace](https://github.com/open-ocpp-trace/specification)
records: one JSON record per line, validated with `@open-ocpp-trace/core`.

The package does no I/O of its own. It reads from any iterable of string or
`Uint8Array` chunks, so the same code runs in browsers, Node.js, Bun and Deno;
the caller opens the file or the stream.

## Install

```sh
npm install @open-ocpp-trace/jsonl
```

The package is ESM only. Its one runtime dependency is
`@open-ocpp-trace/core`, which defines the `TraceRecord` type.

## Entry points

| Import path                     | Exports                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `@open-ocpp-trace/jsonl`        | everything below, plus `SCHEMA_VERSION` re-exported from core |
| `@open-ocpp-trace/jsonl/reader` | the reader only                                               |

## Reader

### `parseRecord`: one line

```ts
import { parseRecord } from "@open-ocpp-trace/jsonl/reader";

const result = parseRecord(text, { line: 42 });
if (result.ok) console.log(result.line, result.record.messageType);
else console.error(result.error.kind, result.error.message); // "Line 42: …"
```

`parseRecord(text, { line? })` parses one line, without its terminator, and
validates it. It returns a `ReadResult`, either
`{ ok: true, record, line }` or `{ ok: false, error }`, and never throws for
bad input: invalid JSON is a `json` error, a JSON value that is not a valid
record is a `validation` error. `line` (default `1`) is only reported; a
value that is not a positive integer throws a `RangeError`.

The record is the object built by `JSON.parse`, returned as is: `raw`,
`timestamp`, `messageId`, unknown fields and `meta` keep their exact values.

### `readRecords`: a stream

`readRecords(source, options)` reads a stream of chunks and returns an
`AsyncIterable`. `source` is an `AsyncIterable` or an `Iterable` of `string`
or `Uint8Array` chunks. Options:

| Option         | Default           | Meaning                               |
| -------------- | ----------------- | ------------------------------------- |
| `maxLineBytes` | `1048576` (1 MiB) | largest accepted line, in UTF-8 bytes |
| `onError`      | `"throw"`         | `"throw"` or `"yield"`, see below     |

In `"throw"` mode (the default), the iterable yields `TraceRecord`s and throws
the first `JsonlReadError`, which ends the iteration:

```ts
import { JsonlReadError, readRecords } from "@open-ocpp-trace/jsonl/reader";

try {
  for await (const record of readRecords(source)) {
    if (record.messageType === "CALL") console.log(record.action);
  }
} catch (error) {
  if (error instanceof JsonlReadError) console.error(error.line, error.kind, error.message);
  else throw error;
}
```

In `"yield"` mode, the iterable yields a `ReadResult` for every non-blank
line and carries on after an unreadable one:

```ts
for await (const result of readRecords(source, { onError: "yield" })) {
  if (result.ok) handle(result.record);
  else console.warn(`skipped line ${result.error.line}: ${result.error.kind}`);
}
```

### Sources

The reader takes plain iterables; these adapters are examples, not part of
the API.

Node.js: a file read stream is an `AsyncIterable<Uint8Array>` (`Buffer` is a
`Uint8Array`), so it is passed as is. Do not set an `encoding` on the stream
unless every chunk is then a string.

```ts
import { createReadStream } from "node:fs";

for await (const record of readRecords(createReadStream("trace.jsonl"))) {
  // …
}
```

Browsers, Deno and Bun: a `ReadableStream<Uint8Array>`, such as
`Response.body` or `Blob.stream()`, is async iterable where the runtime
supports it (recent Chromium and Firefox releases, Node.js, Deno, Bun; check
your browser targets):

```ts
const response = await fetch("/traces/session.jsonl");
if (response.body === null) throw new Error("empty response");
for await (const record of readRecords(response.body)) {
  // …
}
```

Where `ReadableStream` is not async iterable (some Safari releases), wrap its
reader:

```ts
async function* chunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

for await (const record of readRecords(chunks(response.body))) {
  // …
}
```

A whole file already in memory is a one-chunk source: `readRecords([text])`.
A plain string is rejected with a `TypeError` when `readRecords` is called,
since it would otherwise be read one code point per chunk.

### Framing rules

- **Line terminators.** Lines end with LF. A CR right before the LF is
  removed, so CRLF files read like LF files. A lone CR is content.
- **Final line.** A last line without a terminating LF is read like any
  other.
- **Blank lines.** Empty lines, and lines of only spaces, tabs and CRs, are
  skipped but counted in the line numbers.
- **BOM.** A UTF-8 byte order mark (`U+FEFF`) is removed at the start of the
  stream only; one at the start of a later line is content, so that line is a `json` error.
- **Encoding.** Byte chunks are decoded as UTF-8; a multibyte character may
  span chunks. Invalid UTF-8 is an `encoding` error for the line holding it.
  Byte chunks need a global `TextDecoder`, present in every supported runtime;
  without one, the first byte chunk makes the iteration throw a `TypeError`
  in both modes.
- **Line size.** A line longer than `maxLineBytes` UTF-8 bytes, excluding
  its LF or CRLF terminator and a stream-initial BOM, is a `line-too-long`
  error, raised as soon as the bound is crossed; the rest of the line is
  discarded up to the next LF. For string chunks, a lone surrogate counts as
  2 bytes. While a line is read, a trailing CR may still be the start of a
  CRLF, so it is held beyond the bound: the reader holds at most
  `maxLineBytes + 1` bytes of a line. A CR that ends the stream without a LF
  is content and counts towards the bound.
- **Chunk types.** One stream is either text or bytes. The first non-empty
  chunk fixes the type; a chunk of the other type, or a chunk that is
  neither a string nor a `Uint8Array`, makes the iteration throw a
  `TypeError` in both modes.
- **Options.** An invalid `maxLineBytes` (not a positive safe integer) or
  `onError` throws a `RangeError` when `readRecords` is called, before any
  chunk is read.

### Memory

The reader holds one line at a time: at most `maxLineBytes + 1` bytes of the
current line, plus the chunk being processed. Records are produced lazily,
one per iteration step, so a consumer that stops iterating stops the reading.
Memory use does not grow with the size of the stream.

### Errors

`JsonlReadError` extends `Error`. Its `message` starts with
`Line <n>: `, and it has:

| Property | Meaning                                                                 |
| -------- | ----------------------------------------------------------------------- |
| `line`   | 1-based line number in the stream, blank lines included                 |
| `kind`   | `"json"`, `"validation"`, `"line-too-long"` or `"encoding"`             |
| `issues` | `ValidationIssue[]` from core for a `validation` error; empty otherwise |
| `cause`  | the `JSON.parse` error (`json`) or the decoder error (`encoding`)       |

Line numbers count LFs from the start of the stream, so they match the line
numbers of a text editor, BOM and blank lines included.
