import { afterEach, describe, expect, it } from 'vitest';
import { isAllowedOperatorRequestPath, isOperatorBearerToken } from './operator';

describe('privileged operator MCP guardrails', () => {
  const originalToken = process.env.MCP_OPERATOR_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.MCP_OPERATOR_TOKEN;
    else process.env.MCP_OPERATOR_TOKEN = originalToken;
  });

  it('requires the configured operator token and compares it exactly', () => {
    process.env.MCP_OPERATOR_TOKEN = 'operator-test-secret';
    expect(isOperatorBearerToken('operator-test-secret')).toBe(true);
    expect(isOperatorBearerToken('operator-test-secret-extra')).toBe(false);
    expect(isOperatorBearerToken('')).toBe(false);
  });

  it('allows API operations while blocking PIN bootstrap/session establishment paths', () => {
    expect(isAllowedOperatorRequestPath('/api/garages/create')).toBe(true);
    expect(isAllowedOperatorRequestPath('/api/reports/financial')).toBe(true);
    expect(isAllowedOperatorRequestPath('/api/auth/invalidate-all-sessions')).toBe(true);
    expect(isAllowedOperatorRequestPath('/api/auth/verify-pin')).toBe(false);
    expect(isAllowedOperatorRequestPath('/api/auth/claim-admin-session')).toBe(false);
    expect(isAllowedOperatorRequestPath('/api/../firebase-admin')).toBe(false);
    expect(isAllowedOperatorRequestPath('/mcp')).toBe(false);
  });
});
