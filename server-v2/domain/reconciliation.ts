import type { LedgerEvent } from '../contracts/financial.js';
import { LedgerEventSchema } from '../contracts/financial.js';
import { addMinorUnits } from './money.js';

export type ReconciliationResult = Readonly<{
  expectedBalanceMinor: number;
  reportedBalanceMinor: number;
  discrepancyMinor: number;
  consistent: boolean;
  eventCount: number;
}>;

export function reconcileWallet(input: Readonly<{
  openingBalanceMinor: number;
  events: ReadonlyArray<LedgerEvent>;
  reportedBalanceMinor: number;
}>): ReconciliationResult {
  if (!Number.isSafeInteger(input.openingBalanceMinor) || !Number.isSafeInteger(input.reportedBalanceMinor)) throw new Error('INVALID_BALANCE');
  let expectedBalanceMinor = input.openingBalanceMinor;
  for (const rawEvent of input.events) {
    const event = LedgerEventSchema.parse(rawEvent);
    const signedAmount = event.kind === 'debit' ? -event.amountMinor : event.amountMinor;
    expectedBalanceMinor = addMinorUnits(expectedBalanceMinor, signedAmount);
  }
  const discrepancyMinor = input.reportedBalanceMinor - expectedBalanceMinor;
  return { expectedBalanceMinor, reportedBalanceMinor: input.reportedBalanceMinor, discrepancyMinor, consistent: discrepancyMinor === 0, eventCount: input.events.length };
}
