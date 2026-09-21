import { describe, expect, it } from 'vitest';
import { compareReadResults } from '../migration/compareReadResults.js';
import { normalizeReadRecords } from '../migration/normalizeReadComparison.js';
import { decideRollbackPolicy, rollbackToLegacy } from '../migration/rollbackPolicy.js';

describe('migration read normalization and comparison', () => {
  it('normalizes legacy and v2 records by stable id and deterministic order', () => {
    const input = [
      { id: 'b', garageId: 'g', createdAt: '2026-09-20T10:02:00+00:00', status: 'ok' },
      { id: 'a', garageId: 'g', createdAt: '2026-09-20T10:01:00Z', status: 'ok' }
    ];
    expect(normalizeReadRecords(input).map((item) => item.id)).toEqual(['a', 'b']);
    expect(normalizeReadRecords(input)).toEqual(normalizeReadRecords([...input].reverse()));
  });

  it('treats timestamps within configured tolerance as equal but preserves meaningful mismatches', () => {
    const base = [{ id: 'record-1', garageId: 'garage-1', updatedAt: '2026-09-20T10:00:00.000Z', status: 'ready' }];
    const close = [{ id: 'record-1', garageId: 'garage-1', updatedAt: '2026-09-20T10:00:00.900Z', status: 'ready' }];
    const far = [{ id: 'record-1', garageId: 'garage-1', updatedAt: '2026-09-20T10:00:02.000Z', status: 'ready' }];
    const common = { endpoint: '/api/v2/read', garageId: 'garage-1', tenantId: 'tenant-1', requestId: 'req-1', dataVersion: 7, legacy: base };
    expect(compareReadResults({ ...common, v2: close, timestampToleranceMs: 1000 }).equality).toBe(true);
    const result = compareReadResults({ ...common, v2: far, timestampToleranceMs: 1000 });
    expect(result.equality).toBe(false);
    expect(result.mismatches.some((mismatch) => mismatch.path.includes('updatedAt'))).toBe(true);
  });

  it('returns sorted, redacted structured diffs and hard financial/authorization flags', () => {
    const result = compareReadResults({
      endpoint: '/api/v2/garage/summary', garageScope: 'garage-1', tenantScope: 'tenant-1', requestId: 'req-2', dataVersion: 'v2-7',
      legacy: [{ id: 'b', amount: 100, authorization: 'secret-token' }, { id: 'a', status: 'ready' }],
      v2: [{ id: 'b', amount: 101, authorization: 'different-token' }, { id: 'c', status: 'new' }]
    });
    expect(result).toMatchObject({ endpoint: '/api/v2/garage/summary', garageScope: 'garage-1', tenantScope: 'tenant-1', requestId: 'req-2', dataVersion: 'v2-7', equality: false, financialMismatch: true, authorizationMismatch: true, financialMismatchHard: true, authorizationMismatchHard: true });
    expect(result.mismatches.map((mismatch) => `${mismatch.id}:${mismatch.path}`)).toEqual(['a:$', 'b:$.amount', 'b:$.authorization', 'c:$']);
    expect(result.mismatches.find((mismatch) => mismatch.path === '$.amount')?.legacy).toBe('[REDACTED]');
    expect(result.mismatches.find((mismatch) => mismatch.path === '$.authorization')?.legacy).toBe('[REDACTED]');
  });
});

describe('migration rollback policy', () => {
  it('fails closed to legacy when the preview flag is off or auth is off', () => {
    expect(decideRollbackPolicy({ previewEnabled: false, legacyFallbackAvailable: true })).toMatchObject({ safe: true, mode: 'legacy', flagOff: true, useLegacyFallback: true, deletesAllowed: false, dualFinancialWritesAllowed: false });
    expect(decideRollbackPolicy({ previewEnabled: true, previewAuthEnabled: false, legacyFallbackAvailable: true }).mode).toBe('legacy');
  });

  it('blocks missing fallback, deletes, and dual financial writes', () => {
    expect(decideRollbackPolicy({ previewEnabled: false, legacyFallbackAvailable: false }).violations).toContain('legacy-fallback-unavailable');
    expect(decideRollbackPolicy({ previewEnabled: true, deleteRequested: true }).violations).toContain('delete-not-permitted');
    expect(decideRollbackPolicy({ previewEnabled: true, financialWriteRequested: true, dualFinancialWriteRequested: true }).violations).toContain('dual-financial-write-not-permitted');
    expect(rollbackToLegacy({ legacyFallbackAvailable: true }).useLegacyFallback).toBe(true);
  });
});
