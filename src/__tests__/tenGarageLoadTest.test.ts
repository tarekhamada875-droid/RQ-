import { describe, expect, it, afterEach } from 'vitest';
import { GARAGE_COUNT, assertSafeTarget, parseTokens } from '../../tools/ten-garage-load-test.mjs';

afterEach(() => {
  delete process.env.LOAD_TEST_ALLOW_NONPROD;
});

describe('staging ten-garage load-test guards', () => {
  it('requires exactly ten unique synthetic identities', () => {
    const entries = Array.from({ length: GARAGE_COUNT }, (_, index) => ({ garageId: `garage-${index}`, token: `token-${index}` }));
    expect(parseTokens(JSON.stringify(entries))).toHaveLength(GARAGE_COUNT);
    expect(() => parseTokens(JSON.stringify(entries.slice(0, -1)))).toThrow(/exactly 10/);
    expect(() => parseTokens(JSON.stringify([...entries.slice(0, -1), entries[0]]))).toThrow(/unique garageId/);
  });

  it('requires an explicit non-production opt-in and rejects production', () => {
    expect(() => assertSafeTarget('https://staging.example.test', 'staging')).toThrow(/explicit non-production opt-in/);
    process.env.LOAD_TEST_ALLOW_NONPROD = '1';
    expect(assertSafeTarget('https://staging.example.test/', 'staging')).toBe('https://staging.example.test');
    expect(() => assertSafeTarget('https://rq.tarekhamada875.workers.dev', 'staging')).toThrow(/production/);
    expect(() => assertSafeTarget('https://staging.example.test', 'production')).toThrow(/production/);
  });
});
