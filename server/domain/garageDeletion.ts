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
