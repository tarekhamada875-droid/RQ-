import crypto from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { VehicleCheckInInputSchema, VehicleCheckInResultSchema, type VehicleCheckInInput, type VehicleCheckInResult } from '../contracts/vehicleCommands.js';
import { type ReadCost, CostCounter } from './packageCatalog.js';
import { mapLegacyVehicle } from './firestoreVehicles.js';
import { businessDateKey, idempotencyFingerprint } from '../domain/operations.js';
import { decideVehicleCheckIn } from '../domain/vehicleCheckIn.js';

const GarageInputSchema = z.object({
  name: z.string().min(1).max(160),
  isLocked: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  isDeleting: z.boolean().optional(),
  balanceExpiry: z.unknown().optional(),
  dailyCapacity: z.number().int().nonnegative().optional(),
  activePackageName: z.string().optional(),
  unlimitedFairUse: z.object({ isMaxLimitReached: z.boolean().optional() }).passthrough().optional(),
  carsInside: z.number().int().nonnegative().optional(),
  todayCount: z.number().int().nonnegative().optional(),
  todayRevenue: z.number().nonnegative().optional(),
  lastTransactionDate: z.string().optional()
}).passthrough();

const IdempotencyInputSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(10000),
  createdAt: z.unknown()
}).strict();

type TimestampLike = Readonly<{ toDate(): Date }>;

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as TimestampLike).toDate === 'function') {
    return (value as TimestampLike).toDate();
  }
  return typeof value === 'string' ? new Date(value) : new Date(NaN);
}

function operationKey(input: VehicleCheckInInput): string {
  return crypto.createHash('sha256').update(`${input.actorUid}:vehicle.check_in:${input.idempotencyKey}`).digest('hex');
}

function parseStoredResult(raw: unknown): VehicleCheckInResult {
  const value = IdempotencyInputSchema.parse(raw);
  return VehicleCheckInResultSchema.parse(JSON.parse(value.responseJson));
}

export interface VehicleCheckInRepository {
  checkIn(input: VehicleCheckInInput): Promise<VehicleCheckInResult>;
}

export class FirestoreVehicleCheckInRepository implements VehicleCheckInRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async checkIn(input: VehicleCheckInInput): Promise<VehicleCheckInResult> {
    const command = VehicleCheckInInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('vehicle.check_in', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command));
      const garageRef = this.firestore.doc(`garages/${command.garageId}`);
      const vehicleRef = this.firestore.doc(`garages/${command.garageId}/vehicles/${command.plateRaw}`);
      const subscriberCollection = this.firestore.collection(`garages/${command.garageId}/subscribers`);
      const today = businessDateKey(new Date(command.occurredAt));
      const dailyStatsRef = this.firestore.doc(`garages/${command.garageId}/daily_stats/${today}`);
      const [idempotencySnapshot, garageSnapshot, vehicleSnapshot, dailyStatsSnapshot, subscriberRawSnapshot, subscriberNormalizedSnapshot] = await Promise.all([
        transaction.get(idempotencyRef),
        transaction.get(garageRef),
        transaction.get(vehicleRef),
        transaction.get(dailyStatsRef),
        transaction.get(subscriberCollection.where('plateNumberRaw', '==', command.plateRaw)),
        transaction.get(subscriberCollection.where('plateNumber', '==', command.plate))
      ]);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      this.costs.recordRead(garageSnapshot.exists ? 1 : 0);
      this.costs.recordRead(vehicleSnapshot.exists ? 1 : 0);
      this.costs.recordRead(dailyStatsSnapshot.exists ? 1 : 0);
      this.costs.recordRead(subscriberRawSnapshot.size);
      this.costs.recordRead(subscriberNormalizedSnapshot.size);

      if (idempotencySnapshot.exists) {
        const stored = IdempotencyInputSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredResult(stored);
      }
      if (!garageSnapshot.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = GarageInputSchema.parse(garageSnapshot.data());
      const expiry = toDate(garage.balanceExpiry);
      if (Number.isNaN(expiry.getTime())) throw new Error('SUBSCRIPTION_EXPIRED');
      const vehicle = vehicleSnapshot.exists ? mapLegacyVehicle(vehicleSnapshot.id, { garageId: command.garageId, ...vehicleSnapshot.data() }) : null;
      const dailyCount = garage.lastTransactionDate === today ? garage.todayCount ?? 0 : 0;
      const dailyCapacity = garage.dailyCapacity ?? 0;
      const isUnlimited = dailyCapacity === 0 || (garage.activePackageName ?? '').includes('مفتوح');
      const fairUseAllowed = garage.unlimitedFairUse?.isMaxLimitReached !== true;
      const activeSubscriber = [...subscriberRawSnapshot.docs, ...subscriberNormalizedSnapshot.docs].some((document) => {
        const subscriber = document.data();
        const status = subscriber.status;
        if (typeof status === 'string' && status !== 'active') return false;
        const startDate = typeof subscriber.startDate === 'string' ? subscriber.startDate : '';
        const endDate = typeof subscriber.endDate === 'string' ? subscriber.endDate : '';
        return startDate !== '' && endDate !== '' && today >= startDate && today <= endDate;
      });
      const result = decideVehicleCheckIn(command, {
        garageId: command.garageId,
        garageName: garage.name,
        isLocked: garage.isLocked === true,
        isSuspended: garage.isSuspended === true,
        isDeleting: garage.isDeleting === true,
        subscriptionExpiresAt: expiry.toISOString(),
        dailyCapacity,
        dailyCount,
        carsInside: garage.carsInside ?? 0,
        isUnlimited,
        fairUseAllowed,
        activeSubscriber,
        today
      }, vehicle);

      transaction.set(vehicleRef, {
        id: command.plateRaw,
        plate: command.plate,
        plateNumber: command.plate,
        plateNumberRaw: command.plateRaw,
        type: command.type,
        entryTime: new Date(command.occurredAt),
        status: 'inside',
        enteredByUid: command.actorUid,
        operationId: result.operationId,
        updatedAt: new Date(command.occurredAt)
      }, { merge: true });
      transaction.set(garageRef, {
        carsInside: result.carsInside,
        todayCount: result.dailyCount,
        todayRevenue: garage.lastTransactionDate === today ? garage.todayRevenue ?? 0 : 0,
        lastTransactionDate: today,
        updatedAt: new Date(command.occurredAt)
      }, { merge: true });
      transaction.set(dailyStatsRef, {
        dateId: today,
        count: result.dailyCount,
        limit: result.dailyCapacity,
        updatedAt: new Date(command.occurredAt)
      }, { merge: true });
      const activityRef = this.firestore.collection('activity_logs').doc();
      transaction.set(activityRef, {
        garageId: command.garageId,
        garageName: garage.name,
        staffId: command.actorUid,
        actionType: 'check_in',
        plateNumber: command.plate,
        timestamp: new Date(command.occurredAt),
        amount: 0,
        operationId: result.operationId
      });
      transaction.create(idempotencyRef, {
        fingerprint,
        responseJson: JSON.stringify(result),
        createdAt: new Date(command.occurredAt)
      });
      this.costs.recordWrite(5);
      return VehicleCheckInResultSchema.parse(result);
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
