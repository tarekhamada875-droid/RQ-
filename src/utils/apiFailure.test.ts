import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/apiClient';
import { classifyApiFailure, getApiFailureReference } from './apiFailure';

describe('API failure classification', () => {
  it('distinguishes network errors, timeouts, server errors, and rejected requests', () => {
    expect(classifyApiFailure(new ApiError('offline', { code: 'NETWORK_ERROR' }))).toBe('network');
    expect(classifyApiFailure(new ApiError('slow', { code: 'API_TIMEOUT' }))).toBe('timeout');
    expect(classifyApiFailure(new ApiError('server', { status: 500 }))).toBe('server');
    expect(classifyApiFailure(new ApiError('invalid', { status: 409 }))).toBe('request');
    expect(classifyApiFailure(new Error('unexpected'))).toBe('unknown');
  });

  it('returns the server correlation reference when present', () => {
    expect(getApiFailureReference(new ApiError('server', { status: 500, correlationId: 'ref-123' }))).toBe('ref-123');
    expect(getApiFailureReference(new Error('unexpected'))).toBeUndefined();
  });
});
