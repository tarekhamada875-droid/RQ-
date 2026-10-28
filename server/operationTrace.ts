import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceContext {
  correlationId: string;
  operationId?: string;
}

const traceContextStorage = new AsyncLocalStorage<TraceContext>();

/** Run Hono request work in a trace context so domain events can inherit request IDs. */
export function withTraceContext<T>(context: TraceContext, action: () => T): T {
  return traceContextStorage.run(context, action);
}

export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}
