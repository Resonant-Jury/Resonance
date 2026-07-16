import { describe, expect, it } from 'vitest';
import { ndjsonValues } from './ndjson';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect<T>(body: ReadableStream<Uint8Array>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of ndjsonValues<T>(body)) out.push(value);
  return out;
}

describe('ndjsonValues', () => {
  it('yields one value per line, in order', async () => {
    const values = await collect(streamOf(['{"a":1}\n{"a":2}\n{"a":3}\n']));
    expect(values).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it('reassembles a value split across chunk boundaries', async () => {
    // The generate-image route streams large base64 payloads that never arrive
    // in one network chunk — the parser must buffer to the newline.
    const values = await collect(
      streamOf(['{"type":"partial","b6', '4":"iVBOR', 'w0KGgo"}\n{"type":"done"}\n']),
    );
    expect(values).toEqual([
      { type: 'partial', b64: 'iVBORw0KGgo' },
      { type: 'done' },
    ]);
  });

  it('yields a trailing value that has no final newline', async () => {
    const values = await collect(streamOf(['{"a":1}\n', '{"done":true}']));
    expect(values).toEqual([{ a: 1 }, { done: true }]);
  });

  it('skips blank lines', async () => {
    const values = await collect(streamOf(['{"a":1}\n\n\n{"a":2}\n']));
    expect(values).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('handles multi-byte UTF-8 split across chunks', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"text":"共振"}\n');
    // Split in the middle of a CJK character's bytes.
    const mid = 10;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, mid));
        controller.enqueue(bytes.slice(mid));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ text: '共振' }]);
  });
});
