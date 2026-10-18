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

export type HealthBody = {
  status?: unknown;
  adminSdk?: unknown;
  version?: unknown;
  commitSha?: unknown;
};

export type HealthyHealthBody = HealthBody & {
  status: 'ok';
  adminSdk: true;
  version: string;
};

export const isSuccessfulHttpStatus = (status: number): boolean => (
  Number.isInteger(status) && status >= 200 && status < 300
);

export const isHealthyHealthBody = (body: unknown): body is HealthyHealthBody => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;

  const health = body as HealthBody;
  return (
    health.status === 'ok' &&
    health.adminSdk === true &&
    typeof health.version === 'string' &&
    health.version.trim().length > 0 &&
    health.version.toLowerCase() !== 'unknown'
  );
};

export const matchesExpectedVersion = (actualVersion: unknown, expectedVersion: string): boolean => (
  !expectedVersion || actualVersion === expectedVersion
);
