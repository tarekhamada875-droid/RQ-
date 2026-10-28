import { describe, expect, it } from 'vitest';
import {
  isHealthyHealthBody,
  isSuccessfulHttpStatus,
  matchesExpectedVersion,
  type HealthBody
} from '../../tools/release-smoke-contract';

const productionVersion = '1.0.0-production';

const healthyBody = (overrides: Partial<HealthBody> = {}) => ({
  status: 'ok',
  adminSdk: true,
  version: productionVersion,
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  ...overrides
});

describe('release smoke health response contract', () => {
  it('accepts an exact healthy health-response fixture', () => {
    const body = healthyBody();

    expect(isSuccessfulHttpStatus(200)).toBe(true);
    expect(isHealthyHealthBody(body)).toBe(true);
    expect(matchesExpectedVersion(body.version, productionVersion)).toBe(true);
  });

  it('accepts only successful 2xx HTTP statuses', () => {
    for (const status of [200, 204, 299]) {
      expect(isSuccessfulHttpStatus(status)).toBe(true);
    }
    for (const status of [0, 199, 300, 404, 503]) {
      expect(isSuccessfulHttpStatus(status)).toBe(false);
    }
  });

  it('rejects unhealthy status, missing admin SDK, or admin SDK disabled', () => {
    expect(isHealthyHealthBody(healthyBody({ status: 'error' }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ adminSdk: undefined }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ adminSdk: false }))).toBe(false);
  });

  it('rejects missing, blank, or unknown version labels', () => {
    expect(isHealthyHealthBody(healthyBody({ version: undefined }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ version: '' }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ version: '   ' }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ version: 'unknown' }))).toBe(false);
    expect(isHealthyHealthBody(healthyBody({ version: 'UNKNOWN' }))).toBe(false);
  });

  it('rejects a well-formed health reply from a different expected release', () => {
    const body = healthyBody();

    expect(isHealthyHealthBody(body)).toBe(true);
    expect(matchesExpectedVersion(body.version, '2.0.0-production')).toBe(false);
    expect(matchesExpectedVersion(body.version, '')).toBe(true);
  });

  it('rejects non-JSON, null, array, and primitive response bodies', () => {
    for (const body of [null, undefined, [], 'status ok', 200, false]) {
      expect(isHealthyHealthBody(body)).toBe(false);
    }
  });

  it('uses the same non-2xx failure rule for the frontend smoke response', () => {
    expect(isSuccessfulHttpStatus(200)).toBe(true);
    expect(isSuccessfulHttpStatus(404)).toBe(false);
    expect(isSuccessfulHttpStatus(503)).toBe(false);
  });
});
