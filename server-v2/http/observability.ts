import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { errorResponse } from '../contracts/api.js';
import { createRequestContext, type RequestContext } from '../observability/requestContext.js';
import { InMemoryRateLimiter } from '../security/rateLimit.js';
import { getV2RequestId } from './requestId.js';

export type RequestContextSink = (context: RequestContext) => void;
export type RateLimitKey = (request: Request) => string;

export function createV2RequestContextMiddleware(sink: RequestContextSink = (context) => {
  console.info(JSON.stringify(context));
}): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const id = getV2RequestId(request);
    request.v2RequestId = id;
    response.setHeader('X-Request-ID', id);
    response.once('finish', () => {
      const route = request.route?.path?.toString() ?? request.originalUrl.split('?')[0] ?? request.path;
      const context = createRequestContext({
        requestId: id,
        route,
        operation: `${request.method.toLowerCase()}.${route}`,
        resultCode: String(response.statusCode),
        latencyMs: Math.max(0, Date.now() - startedAt),
        ...(request.v2Authorization ? { authorization: request.v2Authorization } : {})
      });
      sink(context);
    });
    next();
  };
}

export function createV2RateLimitMiddleware(
  limiter: InMemoryRateLimiter,
  keyResolver: RateLimitKey = (request) => request.v2Authorization?.uid ?? request.ip ?? 'anonymous'
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const decision = limiter.check(keyResolver(request));
    response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json(errorResponse(getV2RequestId(request), 'RATE_LIMITED', 'Too many requests'));
      return;
    }
    next();
  };
}
