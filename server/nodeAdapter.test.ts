import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as nodeRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { PassThrough, Readable } from 'node:stream';
import api from './api';
import { createNodeApiServer, handleNodeApiRequest } from './nodeAdapter';

interface HttpResult {
  status: number;
  headers: import('node:http').IncomingHttpHeaders;
  body: Buffer;
}

let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

function createApp(fetch: (request: Request) => Promise<Response>): typeof api {
  return { fetch } as unknown as typeof api;
}

async function listen(fetch: (request: Request) => Promise<Response>, maxRequestBodyBytes?: number): Promise<number> {
  const options = maxRequestBodyBytes === undefined ? {} : { maxRequestBodyBytes };
  server = createNodeApiServer(createApp(fetch), options);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Adapter did not bind');
  return address.port;
}

function sendRequest(
  port: number,
  method: string,
  chunks: Buffer[] = [],
  headers: Record<string, string> = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = nodeRequest({ hostname: '127.0.0.1', port, path: '/adapter-test', method, headers }, (response) => {
      const body: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(body)
      }));
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

function makeByteStream(totalBytes: number, seed: number, chunkBytes = 16 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - offset);
      const chunk = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) chunk[index] = (offset + index + seed) % 256;
      offset += size;
      controller.enqueue(chunk);
    }
  });
}

function expectedBytes(totalBytes: number, seed: number): Buffer {
  const expected = Buffer.allocUnsafe(totalBytes);
  for (let index = 0; index < totalBytes; index += 1) expected[index] = (index + seed) % 256;
  return expected;
}

describe('Node Fetch adapter request bounds', () => {
  it.each(['GET', 'HEAD'])('does not iterate a %s request body', async (method) => {
    const incoming = new Readable({ read() {} }) as IncomingMessage;
    Object.assign(incoming, { method, url: '/unread-body', headers: { host: 'example.test' } });
    const iterator = vi.spyOn(incoming, Symbol.asyncIterator).mockImplementation(() => {
      throw new Error('GET/HEAD body must not be consumed');
    });
    const outgoing = new PassThrough() as PassThrough & {
      statusCode: number;
      setHeader: (name: string, value: string | number | readonly string[]) => PassThrough;
    };
    outgoing.statusCode = 0;
    outgoing.setHeader = () => outgoing;
    const app = createApp(async (request) => new Response(request.method));

    await handleNodeApiRequest(incoming, outgoing as unknown as ServerResponse, app);

    expect(iterator).not.toHaveBeenCalled();
    expect(outgoing.statusCode).toBe(200);
  });

  it.each(['GET', 'HEAD'])('ignores a %s body when adapting a real HTTP request', async (method) => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe(method);
      expect(request.body).toBeNull();
      return new Response('accepted');
    });
    const port = await listen(fetch);

    const result = await sendRequest(port, method, [Buffer.from('ignored body')], {
      'transfer-encoding': 'chunked'
    });

    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    if (method === 'HEAD') expect(result.body).toEqual(Buffer.alloc(0));
    else expect(result.body.toString()).toBe('accepted');
  });

  it('accepts a body exactly at the configured limit and preserves its bytes', async () => {
    const bytes = Buffer.from([0, 1, 127, 128, 254, 255]);
    const port = await listen(async (request) => {
      const echoed = Buffer.from(await request.arrayBuffer());
      return new Response(echoed, { status: 201, headers: { 'x-adapter-test': 'preserved' } });
    }, bytes.length);

    const result = await sendRequest(port, 'POST', [bytes], { 'content-length': String(bytes.length) });

    expect(result.status).toBe(201);
    expect(result.headers['x-adapter-test']).toBe('preserved');
    expect(result.body).toEqual(bytes);
  });

  it('rejects an oversized Content-Length before forwarding the request', async () => {
    const fetch = vi.fn(async () => new Response('should not run'));
    const port = await listen(fetch, 4);

    const result = await sendRequest(port, 'POST', [Buffer.from('12345')], { 'content-length': '5' });

    expect(result.status).toBe(413);
    expect(result.headers.connection).toBe('close');
    expect(result.body.toString()).toContain('REQUEST_BODY_TOO_LARGE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the configured environment limit when no per-server limit is supplied', async () => {
    vi.stubEnv('RQ_NODE_ADAPTER_MAX_BODY_BYTES', '4');
    const fetch = vi.fn(async () => new Response('should not run'));
    const port = await listen(fetch);

    const result = await sendRequest(port, 'POST', [Buffer.from('12345')], { 'content-length': '5' });

    expect(result.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('counts chunked bytes and rejects the first byte over the limit', async () => {
    const fetch = vi.fn(async () => new Response('should not run'));
    const port = await listen(fetch, 4);

    const result = await sendRequest(port, 'POST', [Buffer.from('12'), Buffer.from('345')], {
      'transfer-encoding': 'chunked'
    });

    expect(result.status).toBe(413);
    expect(result.headers.connection).toBe('close');
    expect(result.body.toString()).toContain('REQUEST_BODY_TOO_LARGE');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts a chunked body exactly at the configured limit', async () => {
    const bytes = Buffer.from('chunked boundary');
    const port = await listen(async (request) => new Response(await request.arrayBuffer()), bytes.length);

    const result = await sendRequest(port, 'POST', [bytes.subarray(0, 5), bytes.subarray(5)], {
      'transfer-encoding': 'chunked'
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(bytes);
  });
});

describe('Node Fetch adapter response streaming', () => {
  it('streams byte-identical responses with status and headers under concurrency', async () => {
    const totalBytes = 256 * 1024;
    let nextSeed = 1;
    const arrayBufferCalls: ReturnType<typeof vi.spyOn>[] = [];
    const port = await listen(async () => {
      const seed = nextSeed;
      nextSeed += 1;
      const response = new Response(makeByteStream(totalBytes, seed), {
        status: 206,
        headers: { 'content-type': 'application/octet-stream', 'x-stream-seed': String(seed) }
      });
      const arrayBuffer = vi.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('Response was buffered'));
      arrayBufferCalls.push(arrayBuffer);
      return response;
    });

    const results = await Promise.all(Array.from({ length: 4 }, () => sendRequest(port, 'GET')));

    expect(results).toHaveLength(4);
    for (const result of results) {
      const seed = Number(result.headers['x-stream-seed']);
      expect(result.status).toBe(206);
      expect(result.headers['content-type']).toBe('application/octet-stream');
      expect(result.body).toEqual(expectedBytes(totalBytes, seed));
    }
    expect(arrayBufferCalls).toHaveLength(4);
    expect(arrayBufferCalls.every((call) => call.mock.calls.length === 0)).toBe(true);
  }, 15_000);

  it('retains the buffered fallback when Readable.fromWeb is unavailable', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Readable, 'fromWeb');
    Object.defineProperty(Readable, 'fromWeb', { ...originalDescriptor, value: undefined });
    try {
      const expected = expectedBytes(31, 17);
      const port = await listen(async () => new Response(makeByteStream(expected.length, 17, 5), {
        status: 202,
        headers: { 'x-fallback': 'used' }
      }));

      const result = await sendRequest(port, 'GET');

      expect(result.status).toBe(202);
      expect(result.headers['x-fallback']).toBe('used');
      expect(result.body).toEqual(expected);
    } finally {
      if (originalDescriptor) Object.defineProperty(Readable, 'fromWeb', originalDescriptor);
    }
  });
});
