export type CommitShaCheck =
  | {
      matches: true;
      expectedCommitSha: string;
      actualCommitSha: string;
    }
  | {
      matches: false;
      expectedCommitSha: string;
      actualCommitSha: unknown;
      reason: 'invalid-expected-sha' | 'missing-or-invalid-actual-sha' | 'commit-sha-mismatch';
    };

export const isGitCommitSha = (value: unknown): value is string => (
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
);

export function compareCommitSha(expectedCommitSha: string, actualCommitSha: unknown): CommitShaCheck {
  if (!isGitCommitSha(expectedCommitSha)) {
    return {
      matches: false,
      expectedCommitSha,
      actualCommitSha,
      reason: 'invalid-expected-sha'
    };
  }

  if (!isGitCommitSha(actualCommitSha)) {
    return {
      matches: false,
      expectedCommitSha,
      actualCommitSha,
      reason: 'missing-or-invalid-actual-sha'
    };
  }

  if (actualCommitSha !== expectedCommitSha) {
    return {
      matches: false,
      expectedCommitSha,
      actualCommitSha,
      reason: 'commit-sha-mismatch'
    };
  }

  return { matches: true, expectedCommitSha, actualCommitSha };
}
