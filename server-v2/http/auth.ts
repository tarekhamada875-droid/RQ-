import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { errorResponse } from '../contracts/api.js';
import { AuthorizationContextSchema, type AuthorizationContext } from '../contracts/auth.js';
import type { Session } from '../contracts/entities.js';
import { authorize, type AuthorizationOperation } from '../domain/authorizationPolicy.js';
import { validateSession } from '../domain/sessionPolicy.js';

const BearerSchema = z.string().regex(/^Bearer\s+\S+$/);
const SessionHeaderSchema = z.string().min(1).max(160);

export type V2TokenClaims = Readonly<{ uid: string }>;

export interface V2AuthDependencies {
  verifyIdToken(token: string): Promise<V2TokenClaims>;
  getSession(uid: string, sessionId: string): Promise<Session | undefined>;
  now?: () => Date;
  inactivityMs?: number;
}

export type V2CorsOptions = Readonly<{
  allowedOrigins: ReadonlySet<string>;
  allowCredentials?: boolean;
}>;

declare global {
  namespace Express {
    interface Request {
      v2Authorization?: AuthorizationContext;
      v2RequestId?: string;
    }
  }
}

function requestId(request: Request): string {
  const supplied = request.header('X-Request-ID');
  return supplied && z.string().uuid().safeParse(supplied).success ? supplied : randomUUID();
}

function sendAuthError(response: Response, request: Request, message: string): void {
  response.status(401).json(errorResponse(requestId(request), 'UNAUTHORIZED', message));
}

function bearerToken(request: Request): string | undefined {
  const header = request.header('Authorization');
  return header && BearerSchema.safeParse(header).success ? header.slice('Bearer '.length).trim() : undefined;
}

export function createV2AuthMiddleware(dependencies: V2AuthDependencies): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const id = requestId(request);
    request.v2RequestId = id;
    const token = bearerToken(request);
    if (!token) {
      response.status(401).json(errorResponse(id, 'UNAUTHORIZED', 'Missing Firebase ID token'));
      return;
    }

    const sessionHeader = request.header('X-Session-ID');
    if (!sessionHeader || !SessionHeaderSchema.safeParse(sessionHeader).success) {
      response.status(401).json(errorResponse(id, 'UNAUTHORIZED', 'Missing canonical session identity'));
      return;
    }

    try {
      const claims = await dependencies.verifyIdToken(token);
      const session = await dependencies.getSession(claims.uid, sessionHeader);
      if (!session) {
        sendAuthError(response, request, 'Canonical session not found');
        return;
      }
      const validation = validateSession({
        tokenUid: claims.uid,
        presentedSessionId: sessionHeader,
        session,
        now: dependencies.now?.() ?? new Date(),
        ...(dependencies.inactivityMs !== undefined ? { inactivityMs: dependencies.inactivityMs } : {})
      });
      if (!validation.valid || !validation.context) {
        sendAuthError(response, request, `Session is not valid: ${validation.reason}`);
        return;
      }
      request.v2Authorization = AuthorizationContextSchema.parse(validation.context);
      next();
    } catch {
      sendAuthError(response, request, 'Invalid Firebase ID token or session');
    }
  };
}

export function requireV2Authorization(operation: AuthorizationOperation, targetGarage?: (request: Request) => string | undefined): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const context = request.v2Authorization;
    if (!context) {
      response.status(401).json(errorResponse(request.v2RequestId ?? requestId(request), 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    const decision = authorize(context, operation, targetGarage?.(request));
    if (!decision.allowed) {
      response.status(403).json(errorResponse(request.v2RequestId ?? requestId(request), 'FORBIDDEN', `Authorization denied: ${decision.reason}`));
      return;
    }
    next();
  };
}

export function createV2CorsMiddleware(options: V2CorsOptions): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const origin = request.header('Origin');
    if (origin) {
      if (!options.allowedOrigins.has(origin)) {
        response.status(403).json(errorResponse(requestId(request), 'FORBIDDEN', 'Origin is not allowed'));
        return;
      }
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      if (options.allowCredentials !== false) response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-ID,X-Session-ID,X-Correlation-ID,X-Operation-ID');
      response.status(204).end();
      return;
    }
    next();
  };
}
