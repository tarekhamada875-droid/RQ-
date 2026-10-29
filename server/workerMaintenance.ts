import { FieldValue } from './firebaseWorkerAdmin';
import { adminDb } from './firebaseAdmin';
import { projectionBucketPath, projectionBucketUpdate, projectionShardCount, ProjectionDelta } from './deltaProjection';

/**
 * Maintained-summary and projection-bucket helpers.
 *
 * These write-side helpers update Firestore "summary" documents atomically
 * (via FieldValue.increment) so that dashboards and admin reports can read
 * O(1) counters instead of recomputing from events every time.
 *
 * Extracted from cloudflareWorker.ts to keep that file focused on
 * middleware + route registration wiring.
 */

export const MAINTAINED_SUMMARY_VERSION = 1;

export function writeProjectionBucket(transaction: any, garageId: string, dateId: string, operationId: string, delta: ProjectionDelta): void {
  if (!adminDb || Object.keys(delta).length === 0) return;
  const configuredRate = Number(process.env.PROJECTION_OPERATIONS_PER_SECOND || 1);
  const shardCount = projectionShardCount(Number.isFinite(configuredRate) ? configuredRate : 1);
  const bucket = projectionBucketUpdate(operationId, dateId, delta, shardCount);
  const bucketRef = adminDb.doc(projectionBucketPath(garageId, dateId, operationId, shardCount));
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(bucketRef, { ...increments, operationId: bucket.operationId, projectionVersion: bucket.projectionVersion, dateId: bucket.dateId, shard: bucket.shard, updatedAt: new Date() }, { merge: true });
}

export function maintainedGarageSummaryRef(garageId: string): any {
  return adminDb?.doc(`garages/${garageId}/maintained_summary/current`);
}

export function maintainedGarageDailySummaryRef(garageId: string, dateId: string): any {
  return adminDb?.doc(`garages/${garageId}/maintained_summary/daily_${dateId}`);
}

export function maintainedAdminSummaryRef(): any {
  return adminDb?.doc('admin_summary/global');
}

export function maintainedSubscriberSummaryRef(): any {
  return adminDb?.doc('subscriber_summary/global');
}

export function writeMaintainedSummaryDelta(transaction: any, ref: any, delta: Record<string, number>, metadata: Record<string, any> = {}): void {
  if (!ref) return;
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(ref, {
    schemaVersion: MAINTAINED_SUMMARY_VERSION,
    ...increments,
    ...metadata,
    updatedAt: new Date()
  }, { merge: true });
}

export function writeMaintainedGarageDelta(transaction: any, garageId: string, delta: Record<string, number>, metadata: Record<string, any> = {}): void {
  writeMaintainedSummaryDelta(transaction, maintainedGarageSummaryRef(garageId), delta, metadata);
}

export function writeMaintainedGarageDailyDelta(transaction: any, garageId: string, dateId: string, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedGarageDailySummaryRef(garageId, dateId), delta, {
    garageId,
    dateId,
    schemaVersion: MAINTAINED_SUMMARY_VERSION
  });
}

export function writeMaintainedAdminDelta(transaction: any, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedAdminSummaryRef(), delta, { summaryScope: 'admin' });
}

export function writeMaintainedSubscriberDelta(transaction: any, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedSubscriberSummaryRef(), delta, { summaryScope: 'subscribers' });
}

export function isUsableMaintainedSummary(value: any, requiredFields: string[] = []): boolean {
  return Boolean(value && value.schemaVersion === MAINTAINED_SUMMARY_VERSION && value.stale !== true && requiredFields.every((field) => Number.isFinite(Number(value[field]))));
}
