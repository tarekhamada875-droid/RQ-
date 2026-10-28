import { describe, expect, it } from 'vitest';
import { createRequestFingerprint } from './idempotency';

describe('request fingerprint contracts', () => {
  it('treats equivalent payloads consistently and distinguishes changed requests', () => {
    const base = {
      garageId: 'garage_1',
      subscriberId: 'sub_1',
      newDates: { startDate: '2026-09-01', endDate: '2026-09-30' }
    };
    const sameRequest = {
      subscriberId: 'sub_1',
      newDates: { endDate: '2026-09-30', startDate: '2026-09-01' },
      garageId: 'garage_1'
    };
    const changedDate = {
      ...base,
      newDates: { ...base.newDates, endDate: '2026-10-01' }
    };

    expect(createRequestFingerprint(base)).toBe(createRequestFingerprint(sameRequest));
    expect(createRequestFingerprint(base)).not.toBe(createRequestFingerprint(changedDate));
    expect(createRequestFingerprint({ garageId: 'garage_1', plateNumber: 'ABC 123', plateRaw: 'ABC123', type: 'hourly' }))
      .not.toBe(createRequestFingerprint({ garageId: 'garage_1', plateNumber: 'ABC 123', plateRaw: 'ABC123', type: 'overnight' }));
  });
});
