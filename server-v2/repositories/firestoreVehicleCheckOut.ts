import crypto from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { VehicleCheckOutInputSchema, VehicleCheckOutResultSchema, type VehicleCheckOutInput, type VehicleCheckOutResult } from '../contracts/vehicleCommands.js';
import { businessDateKey, idempotencyFingerprint } from '../domain/operations.js';
import { calculateVehiclePrice } from '../domain/vehiclePricing.js';
import { mapLegacyVehicle } from './firestoreVehicles.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const GarageInputSchema = z.object({
  name: z.string().min(1).max(160),
  hourlyRate: z.number().nonnegative().optional(),
  overnightRate: z.number().nonnegative().optional(),
  totalRevenue: z.number().nonnegative().optional(),
  todayRevenue: z.number().nonnegative().optional(),
  totalVehiclesOut: z.number().int().nonnegative().optional(),
  carsInside: z.number().int().nonnegative().optional(),
  todayCount: z.number().int().nonnegative().optional(),
  lastTransactionDate: z.string().optional()
}).passthrough();

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(10000),
  createdAt: z.unknown()
}).strict();

function operationKey(input: VehicleCheckOutInput): string {
  return crypto.createHash('sha256').update(`${input.actorUid}:vehicle.check_out:${input.idempotencyKey}`).digest('hex');
}

function parseStoredResult(raw: unknown): VehicleCheckOutResult {
  const stored = StoredResultSchema.parse(raw);
  return VehicleCheckOutResultSchema.parse(JSON.parse(stored.responseJson));
}

export interface VehicleCheckOutRepository {
  checkOut(input: VehicleCheckOutInput): Promise<VehicleCheckOutResult>;
}

export class FirestoreVehicleCheckOutRepository implements VehicleCheckOutRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async checkOut(input: VehicleCheckOutInput): Promise<VehicleCheckOutResult> {
    const command = VehicleCheckOutInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('vehicle.check_out', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command));
      const garageRef = this.firestore.doc(`garages/${command.garageId}`);
      const vehicleRef = this.firestore.doc(`garages/${command.garageId}/vehicles/${command.vehicleId}`);
      const today = businessDateKey(new Date(command.occurredAt));
      const dailyStatsRef = this.firestore.doc(`garages/${command.garageId}/daily_stats/${today}`);
      const [idempotencySnapshot, garageSnapshot, vehicleSnapshot, dailyStatsSnapshot] = await Promise.all([
        transaction.get(idempotencyRef),
        transaction.get(garageRef),
        transaction.get(vehicleRef),
        transaction.get(dailyStatsRef)
      ]);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      this.costs.recordRead(garageSnapshot.exists ? 1 : 0);
      this.costs.recordRead(vehicleSnapshot.exists ? 1 : 0);
      this.costs.recordRead(dailyStatsSnapshot.exists ? 1 : 0);

      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredResult(stored);
      }
      if (!garageSnapshot.exists) throw new Error('GARAGE_NOT_FOUND');
      if (!vehicleSnapshot.exists) throw new Error('VEHICLE_NOT_FOUND');
      const garage = GarageInputSchema.parse(garageSnapshot.data());
      const rawVehicle = vehicleSnapshot.data() ?? {};
      if (rawVehicle.status === 'outside') throw new Error('VEHICLE_ALREADY_OUTSIDE');
      const vehicle = mapLegacyVehicle(command.vehicleId, { garageId: command.garageId, ...rawVehicle });
      if (vehicle.status !== 'inside' || !vehicle.entryAt) throw new Error('VEHICLE_NOT_INSIDE');
      const pricing = calculateVehiclePrice({
        isSubscriber: rawVehicle.isSubscriber === true,
        type: rawVehicle.type === 'overnight' ? 'overnight' : 'hourly',
        entryAt: vehicle.entryAt,
        hourlyRate: garage.hourlyRate ?? 0,
        overnightRate: garage.overnightRate ?? 0,
        now: command.occurredAt
      });
      const operationId = `vehicle_${crypto.createHash('sha256').update(`check_out:${command.garageId}:${command.vehicleId}:${command.idempotencyKey}`).digest('hex').slice(0, 32)}`;
      const result = VehicleCheckOutResultSchema.parse({
        operationId,
        garageId: command.garageId,
        vehicleId: command.vehicleId,
        cost: pricing.amount,
        currency: pricing.currency
      });
      const isNewDay = garage.lastTransactionDate !== today;
      const todayRevenue = isNewDay ? result.cost : (garage.todayRevenue ?? 0) + result.cost;
      transaction.set(vehicleRef, {
        status: 'outside',
        exitTime: new Date(command.occurredAt),
        totalCost: result.cost,
        operationId,
        updatedAt: new Date(command.occurredAt)
      }, { merge: true });
      transaction.set(garageRef, {
        totalRevenue: (garage.totalRevenue ?? 0) + result.cost,
        totalVehiclesOut: (garage.totalVehiclesOut ?? 0) + 1,
        todayRevenue,
        todayCount: isNewDay ? 0 : (garage.todayCount ?? 0),
        lastTransactionDate: today,
        carsInside: Math.max(0, (garage.carsInside ?? 0) - 1),
        updatedAt: new Date(command.occurredAt)
      }, { merge: true });
      if (!dailyStatsSnapshot.exists) {
        transaction.set(dailyStatsRef, { dateId: today, count: 0, revenue: result.cost, createdAt: new Date(command.occurredAt) });
      } else {
        transaction.set(dailyStatsRef, { revenue: (dailyStatsSnapshot.data()?.revenue ?? 0) + result.cost, updatedAt: new Date(command.occurredAt) }, { merge: true });
      }
      const activityRef = this.firestore.collection('activity_logs').doc();
      transaction.set(activityRef, {
        garageId: command.garageId,
        garageName: garage.name,
        staffId: command.actorUid,
        actionType: 'check_out',
        plateNumber: rawVehicle.plateNumber ?? rawVehicle.plate ?? command.vehicleId,
        plateNumberRaw: rawVehicle.plateNumberRaw ?? command.vehicleId,
        entryTime: rawVehicle.entryTime ?? rawVehicle.entryAt,
        type: rawVehicle.type ?? 'hourly',
        isSubscriber: rawVehicle.isSubscriber === true,
        timestamp: new Date(command.occurredAt),
        amount: result.cost,
        operationId
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: new Date(command.occurredAt) });
      this.costs.recordWrite(5);
      return result;
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
