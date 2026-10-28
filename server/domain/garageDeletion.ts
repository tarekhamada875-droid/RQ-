export type GarageDeletionError = 'FORBIDDEN_ADMIN_REQUIRED' | 'GARAGE_NOT_FOUND';

export type GarageDeletionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GarageDeletionError };

export interface GarageDeletionCommand {
  readonly callerRole: string | undefined;
  readonly garageId: string;
}

export interface GarageDeletionGarageState {
  readonly exists: boolean;
  readonly name: string;
}

export interface GarageDeletionJobState {
  readonly exists: boolean;
  readonly status?: string;
  readonly garageName?: string;
  readonly updatedAt?: unknown;
  readonly leaseExpiresAt?: unknown;
}

export const GARAGE_DELETION_LEASE_MS = 5 * 60 * 1000;

function timestampMillis(value: unknown): number | undefined {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.getTime();
  if (typeof value === 'number' || typeof value === 'string') {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? undefined : time;
  }
  return undefined;
}

export function isGarageDeletionClaimActive(job: GarageDeletionJobState, nowMs = Date.now()): boolean {
  if (job.status !== 'running') return false;
  const explicitExpiry = timestampMillis(job.leaseExpiresAt);
  if (explicitExpiry !== undefined) return explicitExpiry > nowMs;
  const lastUpdated = timestampMillis(job.updatedAt);
  return lastUpdated !== undefined && lastUpdated + GARAGE_DELETION_LEASE_MS > nowMs;
}

export type GarageDeletionDecision =
  | { readonly kind: 'already_deleted'; readonly garageId: string }
  | { readonly kind: 'delete'; readonly garageId: string; readonly garageName: string; readonly resume: boolean };

export function decideGarageDeletion(
  command: GarageDeletionCommand,
  garage: GarageDeletionGarageState,
  job: GarageDeletionJobState,
): GarageDeletionResult<GarageDeletionDecision> {
  if (command.callerRole !== 'admin') return { ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' };
  if (!garage.exists) {
    if (job.exists && job.status === 'completed') {
      return { ok: true, value: { kind: 'already_deleted', garageId: command.garageId } };
    }
    if (job.exists && (job.status === 'running' || job.status === 'failed')) {
      return {
        ok: true,
        value: { kind: 'delete', garageId: command.garageId, garageName: job.garageName || '', resume: true },
      };
    }
    return { ok: false, error: 'GARAGE_NOT_FOUND' };
  }
  return {
    ok: true,
    value: {
      kind: 'delete',
      garageId: command.garageId,
      garageName: garage.name,
      resume: job.exists && job.status === 'running',
    },
  };
}
