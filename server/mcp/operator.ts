import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const MCP_PATH = '/mcp';
const DEFAULT_BACKEND_URL = `http://127.0.0.1:${process.env.PORT || 8080}`;
const BLOCKED_AUTH_PATHS = new Set([
  '/api/auth/verify-pin',
  '/api/auth/verify-admin-pin',
  '/api/auth/check-pin-availability',
  '/api/auth/claim-admin-session',
  '/api/auth/validate-or-refresh-session',
  '/api/auth/release-session',
  '/api/auth/release-admin-session'
]);

const operatorRequestSchema = {
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).max(200),
  query: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().min(8).max(200).optional()
};

type OperatorRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

function configuredOperatorToken(): string {
  return String(process.env.MCP_OPERATOR_TOKEN || '').trim();
}

function constantTimeTokenMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export function isOperatorBearerToken(token: string): boolean {
  return constantTimeTokenMatch(token, configuredOperatorToken());
}

export function isOperatorRequestAuthorized(request: Request): boolean {
  const expected = configuredOperatorToken();
  const authorization = String(request.headers.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const headerKey = String(request.headers['x-mcp-operator-key'] || '').trim();
  return isOperatorBearerToken(bearer) || constantTimeTokenMatch(headerKey, expected);
}

export function isAllowedOperatorRequestPath(path: string): boolean {
  return path.startsWith('/api/') && !path.includes('..') && !BLOCKED_AUTH_PATHS.has(path.split('?')[0]);
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function createOperatorServer(): McpServer {
  const server = new McpServer({
    name: 'rq-privileged-operator',
    version: '1.0.0'
  });

  server.registerTool(
    'backend_request',
    {
      title: 'RQ privileged backend request',
      description:
        'Execute an authenticated, server-authorized request against the RQ backend. This is privileged operator access covering operational, financial, administrative, reporting, and session-management API routes. Use the exact API path and preserve idempotency for mutations. Never invent IDs or financial values.',
      inputSchema: operatorRequestSchema,
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false
      }
    },
    async (input: OperatorRequest) => {
      if (!configuredOperatorToken()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'MCP_OPERATOR_TOKEN is not configured on the server.' }]
        };
      }
      if (!isAllowedOperatorRequestPath(input.path)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Blocked backend path: ${input.path}` }]
        };
      }

      const baseUrl = String(process.env.MCP_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
      const target = new URL(`${baseUrl}${input.path}`);
      for (const [key, value] of Object.entries(input.query || {})) target.searchParams.set(key, value);

      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${configuredOperatorToken()}`,
        'X-Correlation-ID': randomUUID(),
        'X-Operation-ID': `mcp_${randomUUID()}`
      };
      if (input.body !== undefined) headers['Content-Type'] = 'application/json';
      if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

      const response = await fetch(target, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body)
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();
      const result = {
        status: response.status,
        ok: response.ok,
        path: input.path,
        data: payload
      };
      return {
        isError: !response.ok,
        content: [{ type: 'text', text: jsonText(result) }]
      };
    }
  );

  return server;
}

export async function handleOperatorMcpRequest(request: Request, response: Response): Promise<void> {
  if (!configuredOperatorToken()) {
    response.status(503).json({ error: 'MCP_OPERATOR_TOKEN_NOT_CONFIGURED' });
    return;
  }
  if (!isOperatorRequestAuthorized(request)) {
    response.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'MCP_OPERATOR_UNAUTHORIZED' });
    return;
  }

  const server = createOperatorServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(request, response, request.body);
}

export const operatorMcpPath = MCP_PATH;
