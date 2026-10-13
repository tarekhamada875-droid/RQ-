import { describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn().mockResolvedValue({ success: true }) }));

vi.mock('../api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiClient')>();
  return { ...actual, apiFetch: apiFetchMock };
});

vi.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn((error) => { throw error; }),
  OperationType: { UPDATE: 'UPDATE' }
}));

import { delegateService } from '../services/delegateService';

describe('delegate settlement idempotency', () => {
  it('reuses the same key for retries in one cycle and changes it for a new cycle', async () => {
    const lastSettledAt = new Date('2026-10-01T10:00:00.000Z');
    await delegateService.settleDelegateAccount('delegate-1', 125, lastSettledAt);
    await delegateService.settleDelegateAccount('delegate-1', 125, lastSettledAt);
    await delegateService.settleDelegateAccount('delegate-1', 50, new Date('2026-10-12T10:00:00.000Z'));

    const requests = apiFetchMock.mock.calls.map((call) => call[1]);
    const firstKey = requests[0].body.idempotencyKey;
    expect(requests[1].body.idempotencyKey).toBe(firstKey);
    expect(requests[2].body.idempotencyKey).not.toBe(firstKey);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].body.id).toBe('delegate-1');
  });
});
