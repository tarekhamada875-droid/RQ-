import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import api from './api';

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Converts Node HTTP requests to Fetch requests for the canonical Hono app. */
export function createNodeApiServer(app = api): Server {
  return createServer(async (nodeRequest, nodeResponse) => {
    try {
      const protocol = (nodeRequest.headers['x-forwarded-proto'] as string | undefined) || 'http';
      const host = nodeRequest.headers.host || '127.0.0.1';
      const body = await readBody(nodeRequest);
      const method = nodeRequest.method || 'GET';
      const request = new Request(`${protocol}://${host}${nodeRequest.url || '/'}`, {
        method,
        headers: nodeRequest.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(method) ? undefined : body
      });
      const response = await app.fetch(request);
      nodeResponse.statusCode = response.status;
      response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
      nodeResponse.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      writeAdapterError(nodeResponse, error);
    }
  });
}

function writeAdapterError(response: ServerResponse, error: unknown): void {
  response.statusCode = 500;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({
    success: false,
    error: 'NODE_ADAPTER_ERROR',
    message: error instanceof Error ? error.message : String(error)
  }));
}
