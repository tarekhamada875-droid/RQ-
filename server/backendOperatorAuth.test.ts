import { afterEach, describe, expect, it } from 'vitest';
import { isValidBackendOperatorToken } from './middleware';

describe('backend operator token authentication', () => {
  const originalToken = process.env.BACKEND_OPERATOR_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.BACKEND_OPERATOR_TOKEN;
    else process.env.BACKEND_OPERATOR_TOKEN = originalToken;
  });

  it('accepts the exact configured token', () => {
    process.env.BACKEND_OPERATOR_TOKEN = 'operator-secret';
    expect(isValidBackendOperatorToken('operator-secret')).toBe(true);
  });

  it('rejects missing, altered, or unconfigured tokens', () => {
    process.env.BACKEND_OPERATOR_TOKEN = 'operator-secret';
    expect(isValidBackendOperatorToken(undefined)).toBe(false);
    expect(isValidBackendOperatorToken('operator-secreT')).toBe(false);
    expect(isValidBackendOperatorToken('operator-secret-extra')).toBe(false);
    expect(isValidBackendOperatorToken('operator-secret', '')).toBe(false);
  });
});
