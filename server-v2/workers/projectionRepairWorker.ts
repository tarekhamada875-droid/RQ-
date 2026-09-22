import {
  ProjectionRepairWorkerBatchResultSchema,
  ProjectionRepairWorkerBatchSchema,
  type ProjectionRepairTaskResult,
  type ProjectionRepairWorkerBatch,
  type ProjectionRepairWorkerBatchResult
} from '../contracts/projectionWorker.js';
import type { ProjectionRepository } from '../repositories/firestoreProjection.js';

const SAFE_REPAIR_ERRORS = new Set([
  'IDEMPOTENCY_KEY_REUSE',
  'PROJECTION_SCOPE_MISMATCH',
  'PROJECTION_ACTIVE_COUNT_NEGATIVE',
  'PROJECTION_AMOUNT_REQUIRED',
  'PROJECTION_REBUILD_WINDOW_EXCEEDED',
  'INVALID_DATE'
]);

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return SAFE_REPAIR_ERRORS.has(message) ? message : 'REPAIR_FAILED';
}

export type ProjectionRepairWorkerOptions = Readonly<{
  repository: ProjectionRepository;
  actorUid: string;
}>;

/**
 * Runs a bounded batch of projection repairs. The worker never scans or mutates
 * outside the event windows supplied by the caller; repository idempotency and
 * audit behavior remain the source of truth for each repair.
 */
export class ProjectionRepairWorker {
  constructor(private readonly options: ProjectionRepairWorkerOptions) {
    if (!options.actorUid || options.actorUid.length > 160) throw new Error('INVALID_WORKER_ACTOR');
  }

  async run(rawBatch: ProjectionRepairWorkerBatch): Promise<ProjectionRepairWorkerBatchResult> {
    const batch = ProjectionRepairWorkerBatchSchema.parse(rawBatch);
    const results: ProjectionRepairTaskResult[] = [];

    for (const task of batch.tasks) {
      try {
        const result = await this.options.repository.rebuild({
          garageId: task.garageId,
          dateKey: task.dateKey,
          events: task.events,
          actorUid: this.options.actorUid,
          idempotencyKey: task.idempotencyKey,
          occurredAt: batch.occurredAt
        });
        results.push({
          taskId: task.taskId,
          state: result.replayed ? 'replayed' : 'rebuilt',
          sourceEventCount: result.sourceEventCount,
          projection: result.projection
        });
      } catch (error) {
        results.push({ taskId: task.taskId, state: 'failed', errorCode: safeErrorCode(error) });
      }
    }

    const output = {
      attempted: results.length,
      rebuilt: results.filter((result) => result.state === 'rebuilt').length,
      replayed: results.filter((result) => result.state === 'replayed').length,
      failed: results.filter((result) => result.state === 'failed').length,
      results
    };
    return ProjectionRepairWorkerBatchResultSchema.parse(output);
  }
}
