import crypto from 'crypto';

export interface OperationMetadata {
  operationId: string;
  operationVersion: number;
}

export interface ProjectionDelta {
  activeVehicleCount?: number;
  entriesToday?: number;
  exitsToday?: number;
  grossRevenue?: number;
  refundTotal?: number;
  netRevenue?: number;
}

export interface ProjectionBucketUpdate extends ProjectionDelta {
  operationId: string;
  projectionVersion: 1;
  dateId: string;
  shard: number;
}

export function createOperationId(scope: string, supplied?: string): string {
  const normalized = String(supplied || '').trim();
  if (normalized) return `op_${scope}_${normalized}`;
  return `op_${scope}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export function nextOperationVersion(previous: unknown): number {
  const value = Number(previous);
  return Number.isInteger(value) && value >= 0 ? value + 1 : 1;
}

/** Deterministically distributes projection writes across a bounded number of buckets. */
export function projectionShard(operationId: string, shardCount: number): number {
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error('INVALID_SHARD_COUNT');
  const digest = crypto.createHash('sha256').update(operationId).digest();
  return digest.readUInt32BE(0) % shardCount;
}

export function projectionShardCount(estimatedOperationsPerSecond = 1): number {
  if (!Number.isFinite(estimatedOperationsPerSecond) || estimatedOperationsPerSecond < 0) throw new Error('INVALID_OPERATION_RATE');
  if (estimatedOperationsPerSecond <= 3) return 2;
  if (estimatedOperationsPerSecond <= 12) return 8;
  return 16;
}

export function projectionBucketPath(garageId: string, dateId: string, operationId: string, shardCount = 8): string {
  if (!garageId || !/^\d{4}-\d{2}-\d{2}$/.test(dateId)) throw new Error('INVALID_PROJECTION_BUCKET_SCOPE');
  const shard = projectionShard(operationId, shardCount);
  return `garages/${garageId}/projection_buckets/${dateId}_${shard}`;
}

export function projectionBucketUpdate(operationId: string, dateId: string, delta: ProjectionDelta, shardCount = 8): ProjectionBucketUpdate {
  const shard = projectionShard(operationId, shardCount);
  return { operationId, projectionVersion: 1, dateId, shard, ...delta };
}

export function createVehicleDelta(eventType: string, amount = 0): ProjectionDelta {
  if (eventType === 'vehicle_entered') return { activeVehicleCount: 1, entriesToday: 1 };
  if (eventType === 'vehicle_exited') return { activeVehicleCount: -1, exitsToday: 1, grossRevenue: Number(amount.toFixed(2)), netRevenue: Number(amount.toFixed(2)) };
  if (eventType === 'vehicle_refunded') return { refundTotal: Number(amount.toFixed(2)), netRevenue: Number((-amount).toFixed(2)) };
  if (eventType === 'vehicle_deleted') return {};
  throw new Error('UNSUPPORTED_PROJECTION_EVENT');
}
