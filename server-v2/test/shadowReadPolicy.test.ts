import { describe, expect, it } from 'vitest';
import { compareReadResults } from '../migration/compareReadResults.js';
import { decideShadowRead } from '../migration/shadowReadPolicy.js';

const comparison = (legacy: unknown, v2: unknown) => compareReadResults({ endpoint: '/api/v2/packages', requestId: 'req-1', dataVersion: 1, legacy: legacy as never, v2: v2 as never });

describe('shadow read policy', () => {
  it('fails closed to legacy when preview is disabled', () => {
    const result = decideShadowRead({ comparison: comparison([{ id: 'a', name: 'A' }], [{ id: 'a', name: 'A' }]), previewEnabled: false, legacyFallbackAvailable: true });
    expect(result).toMatchObject({ mode: 'legacy', reason: 'preview_disabled' });
  });

  it('keeps legacy on every mismatch and identifies hard financial or auth differences', () => {
    expect(decideShadowRead({ comparison: comparison([{ id: 'a', amount: 1 }], [{ id: 'a', amount: 2 }]), previewEnabled: true, previewAuthEnabled: true, legacyFallbackAvailable: true })).toMatchObject({ mode: 'legacy', reason: 'financial_mismatch' });
    expect(decideShadowRead({ comparison: comparison([{ id: 'a', role: 'admin' }], [{ id: 'a', role: 'user' }]), previewEnabled: true, previewAuthEnabled: true, legacyFallbackAvailable: true })).toMatchObject({ mode: 'legacy', reason: 'authorization_mismatch' });
    expect(decideShadowRead({ comparison: comparison([{ id: 'a', name: 'A' }], [{ id: 'a', name: 'B' }]), previewEnabled: true, previewAuthEnabled: true, legacyFallbackAvailable: true })).toMatchObject({ mode: 'legacy', reason: 'comparison_mismatch' });
  });

  it('permits v2 only after an equal authenticated comparison', () => {
    const result = decideShadowRead({ comparison: comparison([{ id: 'a', name: 'A' }], [{ id: 'a', name: 'A' }]), previewEnabled: true, previewAuthEnabled: true, legacyFallbackAvailable: true });
    expect(result).toMatchObject({ mode: 'v2', reason: 'comparison_equal' });
  });

  it('blocks if rollback safety has a missing legacy fallback', () => {
    const result = decideShadowRead({ comparison: comparison([{ id: 'a' }], [{ id: 'a' }]), previewEnabled: false, legacyFallbackAvailable: false });
    expect(result).toMatchObject({ mode: 'blocked', reason: 'rollback_blocked' });
  });
});
