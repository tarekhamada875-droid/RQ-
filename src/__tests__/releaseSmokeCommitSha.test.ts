import { describe, expect, it } from 'vitest';
import { compareCommitSha, isGitCommitSha } from '../../tools/release-smoke-contract';

describe('release smoke commit identity', () => {
  const releaseSha = '0123456789abcdef0123456789abcdef01234567';
  const newerSha = '89abcdef0123456789abcdef0123456789abcdef';

  it('accepts a healthy response only when the complete expected commit SHA matches', () => {
    expect(isGitCommitSha(releaseSha)).toBe(true);
    expect(compareCommitSha(releaseSha, releaseSha)).toEqual({
      matches: true,
      expectedCommitSha: releaseSha,
      actualCommitSha: releaseSha
    });
  });

  it('rejects a stale or different live commit SHA and reports both values', () => {
    expect(compareCommitSha(releaseSha, newerSha)).toEqual({
      matches: false,
      expectedCommitSha: releaseSha,
      actualCommitSha: newerSha,
      reason: 'commit-sha-mismatch'
    });
  });

  it('rejects a missing, malformed, or abbreviated live SHA', () => {
    expect(compareCommitSha(releaseSha, undefined)).toMatchObject({
      matches: false,
      expectedCommitSha: releaseSha,
      reason: 'missing-or-invalid-actual-sha'
    });
    expect(compareCommitSha(releaseSha, '0123456')).toMatchObject({
      matches: false,
      expectedCommitSha: releaseSha,
      actualCommitSha: '0123456',
      reason: 'missing-or-invalid-actual-sha'
    });
    expect(isGitCommitSha('g'.repeat(40))).toBe(false);
  });

  it('rejects a malformed selected release SHA before trusting any live response', () => {
    expect(compareCommitSha('not-a-sha', releaseSha)).toMatchObject({
      matches: false,
      expectedCommitSha: 'not-a-sha',
      actualCommitSha: releaseSha,
      reason: 'invalid-expected-sha'
    });
  });

  it('rehearses rollback by selecting an earlier SHA and reports that exact target', () => {
    const selectedRollbackSha = releaseSha;
    const servingBeforeRollback = newerSha;

    expect(compareCommitSha(selectedRollbackSha, servingBeforeRollback)).toMatchObject({
      matches: false,
      expectedCommitSha: selectedRollbackSha,
      actualCommitSha: servingBeforeRollback,
      reason: 'commit-sha-mismatch'
    });
    expect(compareCommitSha(selectedRollbackSha, selectedRollbackSha)).toEqual({
      matches: true,
      expectedCommitSha: selectedRollbackSha,
      actualCommitSha: selectedRollbackSha
    });
  });
});
