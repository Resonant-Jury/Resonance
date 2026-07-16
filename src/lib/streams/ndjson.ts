/**
 * Newline-delimited JSON over a byte stream — the wire format for API routes
 * that report progress before their final payload (e.g. the image generator's
 * partial previews). One JSON value per line; the parser is chunk-boundary
 * safe (a value split across network chunks is buffered until its newline).
 */

/** Iterate the JSON values of an NDJSON byte stream, in order. */
export async function* ndjsonValues<T = unknown>(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }
    const tail = (buffer + decoder.decode()).trim();
    if (tail) yield JSON.parse(tail) as T;
  } finally {
    reader.releaseLock();
  }
}
