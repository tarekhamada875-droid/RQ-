import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import api from './api';

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 1_048_576;
export const MAX_REQUEST_BODY_BYTES_ENV = 'RQ_NODE_ADAPTER_MAX_BODY_BYTES';

function resolveLocalApiEnvironment(): Record<string, unknown> | undefined {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) return undefined;

  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'demo-rq-ui-fixtures',
    FIREBASE_DATABASE_ID: process.env.FIREBASE_DATABASE_ID || '(default)',
    ENVIRONMENT: 'local',
    PIN_RATE_LIMITER: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ success: true, allowed: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      }),
    },
  };
}

export interface NodeApiAdapterOptions {
  maxRequestBodyBytes?: number;
}

class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes} byte limit`);
    this.name = 'RequestBodyTooLargeError';
  }
}

function resolveMaxRequestBodyBytes(configured?: number): number {
  const environmentValue = process.env[MAX_REQUEST_BODY_BYTES_ENV];
  let value = configured;
  if (value === undefined) {
    if (environmentValue === undefined) value = DEFAULT_MAX_REQUEST_BODY_BYTES;
    else if (/^\d+$/.test(environmentValue)) value = Number(environmentValue);
    else throw new RangeError(`${MAX_REQUEST_BODY_BYTES_ENV} must be a non-negative safe integer`);
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${MAX_REQUEST_BODY_BYTES_ENV} must be a non-negative safe integer`);
  }
  return value;
}

async function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const contentLength = request.headers['content-length'];
  if (typeof contentLength === 'string') {
    const declaredBytes = Number(contentLength);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
      request.off('close', cleanup);
    };

    const fail = (error: Error, stopReading = false) => {
      if (settled) return;
      settled = true;
      if (stopReading) {
        request.pause();
        request.off('data', onData);
        request.off('end', onEnd);
        request.off('aborted', onAborted);
        request.once('close', cleanup);
      } else {
        cleanup();
      }
      reject(error);
    };

    const onData = (chunk: Buffer | Uint8Array | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const nextTotal = totalBytes + bytes.byteLength;
      if (nextTotal > maxBytes) {
        fail(new RequestBodyTooLargeError(maxBytes), true);
        return;
      }
      totalBytes = nextTotal;
      chunks.push(bytes);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, totalBytes));
    };

    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new Error('Request was aborted before its body completed'));

    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

async function sendFetchResponse(response: Response, nodeResponse: ServerResponse): Promise<void> {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));

  if (response.body && typeof Readable.fromWeb === 'function') {
    const nodeBody = Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>);
    await pipeline(nodeBody, nodeResponse);
    return;
  }

  // Older Node runtimes without Readable.fromWeb retain the prior buffered behavior.
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

/** Converts Node HTTP requests to Fetch requests for the canonical Hono app. */
export async function handleNodeApiRequest(
  nodeRequest: IncomingMessage,
  nodeResponse: ServerResponse,
  app = api,
  options: NodeApiAdapterOptions = {}
): Promise<void> {
  try {
    const method = nodeRequest.method || 'GET';
    const hasRequestBody = !['GET', 'HEAD'].includes(method.toUpperCase());
    const maxRequestBodyBytes = resolveMaxRequestBodyBytes(options.maxRequestBodyBytes);
    const body = hasRequestBody ? await readBoundedBody(nodeRequest, maxRequestBodyBytes) : undefined;
    const protocol = (nodeRequest.headers['x-forwarded-proto'] as string | undefined) || 'http';
    const host = nodeRequest.headers.host || '127.0.0.1';
    const request = new Request(`${protocol}://${host}${nodeRequest.url || '/'}`, {
      method,
      headers: nodeRequest.headers as Record<string, string>,
      body
    });
    const response = await app.fetch(request, resolveLocalApiEnvironment());
    await sendFetchResponse(response, nodeResponse);
  } catch (error) {
    writeAdapterError(nodeResponse, error);
  }
}

export function createNodeApiServer(app = api, options: NodeApiAdapterOptions = {}): Server {
  const maxRequestBodyBytes = resolveMaxRequestBodyBytes(options.maxRequestBodyBytes);
  return createServer((nodeRequest, nodeResponse) => {
    void handleNodeApiRequest(nodeRequest, nodeResponse, app, { maxRequestBodyBytes });
  });
}

function writeAdapterError(response: ServerResponse, error: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }

  const isBodyTooLarge = error instanceof RequestBodyTooLargeError;
  response.statusCode = isBodyTooLarge ? 413 : 500;
  response.setHeader('content-type', 'application/json');
  if (isBodyTooLarge) response.setHeader('connection', 'close');
  response.end(JSON.stringify({
    success: false,
    error: isBodyTooLarge ? 'REQUEST_BODY_TOO_LARGE' : 'NODE_ADAPTER_ERROR',
    message: error instanceof Error ? error.message : String(error)
  }));
}
