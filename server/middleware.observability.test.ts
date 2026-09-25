import { describe, expect, it, vi } from 'vitest';
import { correlationMiddleware, sendApiError } from './middleware';

describe('observability middleware contracts', () => {
  it('preserves a bounded safe correlation ID and echoes it in the response', () => {
    const req = { headers: { 'x-correlation-id': 'ui:checkout-123' } } as any;
    const res = { setHeader: vi.fn(), locals: {} } as any;
    const next = vi.fn();

    correlationMiddleware(req, res, next);

    expect(req.correlationId).toBe('ui:checkout-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'ui:checkout-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces unsafe or oversized correlation IDs instead of logging attacker-controlled data', () => {
    const req = { headers: { 'x-correlation-id': `${'x'.repeat(129)}\nsecret` } } as any;
    const res = { setHeader: vi.fn(), locals: {} } as any;

    correlationMiddleware(req, res, vi.fn());

    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', req.correlationId);
  });

  it('stores only a safe error code for operation tracing while preserving the API envelope', () => {
    const response = {
      locals: {},
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;

    sendApiError(response, 409, 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'corr-1');

    expect(response.locals.apiErrorCode).toBe('IDEMPOTENCY_CONFLICT');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'IDEMPOTENCY_CONFLICT',
      correlationId: 'corr-1',
    }));
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('secret');
  });
});
