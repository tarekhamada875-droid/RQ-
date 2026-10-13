import { describe, expect, it } from 'vitest';
import { getTraceContext, withTraceContext } from './operationTrace';

describe('request trace context', () => {
  it('preserves correlation and operation identifiers across asynchronous work', async () => {
    expect(getTraceContext()).toBeUndefined();
    const result = await withTraceContext(
      { correlationId: 'corr-hono-1', operationId: 'operation-hono-1' },
      async () => {
        await Promise.resolve();
        return getTraceContext();
      }
    );
    expect(result).toEqual({ correlationId: 'corr-hono-1', operationId: 'operation-hono-1' });
    expect(getTraceContext()).toBeUndefined();
  });

  it('restores the enclosing request context after a nested operation', () => {
    withTraceContext({ correlationId: 'outer' }, () => {
      expect(getTraceContext()?.correlationId).toBe('outer');
      withTraceContext({ correlationId: 'inner', operationId: 'op-inner' }, () => {
        expect(getTraceContext()).toEqual({ correlationId: 'inner', operationId: 'op-inner' });
      });
      expect(getTraceContext()).toEqual({ correlationId: 'outer' });
    });
    expect(getTraceContext()).toBeUndefined();
  });
});
