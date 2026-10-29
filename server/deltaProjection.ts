import crypto from 'crypto';
import { parseMoneyAmount } from './money';

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

export function createOperationId(scope: string, supplied?: string): string {
  const normalized = String(supplied || '').trim();
  if (normalized) return `op_${scope}_${normalized}`;
  return `op_${scope}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export function nextOperationVersion(previous: unknown): number {
  const value = Number(previous);
  return Number.isInteger(value) && value >= 0 ? value + 1 : 1;
}

export function createVehicleDelta(eventType: string, amount = 0): ProjectionDelta {
  if (eventType === 'vehicle_entered') return { activeVehicleCount: 1, entriesToday: 1 };
  if (eventType === 'vehicle_exited') {
    const moneyAmount = parseMoneyAmount(amount);
    if (moneyAmount === null) throw new Error('INVALID_MONEY_AMOUNT');
    return { activeVehicleCount: -1, exitsToday: 1, grossRevenue: moneyAmount, netRevenue: moneyAmount };
  }
  if (eventType === 'vehicle_refunded') {
    const moneyAmount = parseMoneyAmount(amount);
    if (moneyAmount === null) throw new Error('INVALID_MONEY_AMOUNT');
    return { refundTotal: moneyAmount, netRevenue: -moneyAmount };
  }
  if (eventType === 'vehicle_deleted') return {};
  throw new Error('UNSUPPORTED_PROJECTION_EVENT');
}
