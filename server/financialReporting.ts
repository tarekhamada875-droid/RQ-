import { addMoney, parseMoneyAmount } from './money';

export interface FinancialReportEvent {
  eventType?: string;
  occurredAt?: string | Date;
  aggregateId?: string;
  payload?: Record<string, unknown>;
}

export interface SettlementRecord {
  settlementId?: string;
  delegateId?: string;
  settledAt?: string | Date;
  previousCycleTotal?: number;
}

export interface CreditLedgerReportEntry {
  kind?: string;
  bucket?: string;
  amount?: unknown;
  paymentAmountEgp?: unknown;
  occurredAt?: string | Date;
}

export interface CreditActivityMetrics {
  paidGrantCount: number;
  paidCreditsGranted: number;
  paidGrantCountWithoutEgpRecord: number;
  paidCreditsWithoutEgpRecord: number;
  referralAwardCount: number;
  referralCreditsGranted: number;
  trialGrantCount: number;
  trialCreditsGranted: number;
  regularEntryDebitCount: number;
  regularEntryCreditsConsumed: number;
  regularEntryPaidCreditsConsumed: number;
  regularEntryReferralCreditsConsumed: number;
  regularEntryTrialCreditsConsumed: number;
  subscriberRenewalCount: number;
  subscriberRenewalCreditsConsumed: number;
  correctionRestoreCount: number;
  restoredCredits: number;
  restoredPaidCredits: number;
  restoredReferralCredits: number;
  restoredTrialCredits: number;
}

export interface FinancialReportOptions {
  start?: string | Date;
  end?: string | Date;
  delegateId?: string;
}

export interface FinancialReport {
  grossRechargeTotal: number;
  walletTopupTotal: number;
  prepaidCreditPaymentsEgp: number | null;
  cashCollectedTotal: number;
  commissionTotal: number;
  refundTotal: number;
  companyNetRevenue: number;
  historicalSettledTotal: number;
  currentUnsettledByDelegate: Record<string, number>;
  creditActivity: CreditActivityMetrics | null;
}

export interface FinancialReportAccumulator {
  readonly options: FinancialReportOptions;
  grossRechargeTotal: number;
  walletTopupTotal: number;
  prepaidCreditPaymentsEgp: number;
  commissionTotal: number;
  refundTotal: number;
  historicalSettledTotal: number;
  currentUnsettledByDelegate: Record<string, number>;
  latestSettlementByDelegate: Record<string, Date>;
  creditActivity: CreditActivityMetrics | null;
}

const emptyCreditActivity = (): CreditActivityMetrics => ({
  paidGrantCount: 0,
  paidCreditsGranted: 0,
  paidGrantCountWithoutEgpRecord: 0,
  paidCreditsWithoutEgpRecord: 0,
  referralAwardCount: 0,
  referralCreditsGranted: 0,
  trialGrantCount: 0,
  trialCreditsGranted: 0,
  regularEntryDebitCount: 0,
  regularEntryCreditsConsumed: 0,
  regularEntryPaidCreditsConsumed: 0,
  regularEntryReferralCreditsConsumed: 0,
  regularEntryTrialCreditsConsumed: 0,
  subscriberRenewalCount: 0,
  subscriberRenewalCreditsConsumed: 0,
  correctionRestoreCount: 0,
  restoredCredits: 0,
  restoredPaidCredits: 0,
  restoredReferralCredits: 0,
  restoredTrialCredits: 0,
});

function asDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') return asDate((value as any).toDate());
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(value: string | Date | undefined, options: FinancialReportOptions): boolean {
  const date = asDate(value);
  if (!date) return false;
  const start = asDate(options.start);
  const end = asDate(options.end);
  return (!start || date >= start) && (!end || date < end);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function addCredits(total: number, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value === 0) return total;
  const next = total + value;
  return Number.isSafeInteger(next) ? next : total;
}

function incrementCount(count: number): number {
  return Number.isSafeInteger(count + 1) ? count + 1 : count;
}

/** Creates constant-in-record-count state for page-by-page financial report aggregation. */
export function createFinancialReportAccumulator(options: FinancialReportOptions = {}): FinancialReportAccumulator {
  return {
    options,
    grossRechargeTotal: 0,
    walletTopupTotal: 0,
    prepaidCreditPaymentsEgp: 0,
    commissionTotal: 0,
    refundTotal: 0,
    historicalSettledTotal: 0,
    currentUnsettledByDelegate: {},
    latestSettlementByDelegate: {},
    creditActivity: options.delegateId ? null : emptyCreditActivity(),
  };
}

/** Adds one settlement while retaining only totals and the latest cutoff per delegate. */
export function addFinancialReportSettlement(accumulator: FinancialReportAccumulator, settlement: SettlementRecord): void {
  if (!inRange(settlement.settledAt, accumulator.options)) return;
  const delegateId = settlement.delegateId || '';
  if (accumulator.options.delegateId && delegateId !== accumulator.options.delegateId) return;
  accumulator.historicalSettledTotal = addMoney(accumulator.historicalSettledTotal, settlement.previousCycleTotal);
  if (!delegateId) return;
  if (accumulator.currentUnsettledByDelegate[delegateId] === undefined) accumulator.currentUnsettledByDelegate[delegateId] = 0;
  const settledAt = asDate(settlement.settledAt);
  if (settledAt && (!accumulator.latestSettlementByDelegate[delegateId] || settledAt > accumulator.latestSettlementByDelegate[delegateId])) {
    accumulator.latestSettlementByDelegate[delegateId] = settledAt;
  }
}

/** Adds one event after settlement pages are loaded, preserving report and delegate rules. */
export function addFinancialReportEvent(accumulator: FinancialReportAccumulator, event: FinancialReportEvent): void {
  if (!inRange(event.occurredAt, accumulator.options)) return;
  const payload = event.payload || {};
  if (accumulator.options.delegateId && String(payload.delegateId || '') !== accumulator.options.delegateId) return;
  if (event.eventType === 'recharge_approved') {
    accumulator.grossRechargeTotal = addMoney(accumulator.grossRechargeTotal, payload.amount);
  }
  if (event.eventType === 'wallet_topup_approved') {
    accumulator.walletTopupTotal = addMoney(accumulator.walletTopupTotal, payload.amount);
  }
  if (event.eventType === 'prepaid_credit_grant_paid') {
    if (typeof payload.amount === 'number' && Number.isSafeInteger(payload.amount) && payload.amount > 0
      && payload.amount === payload.creditAmount && typeof payload.creditLedgerEntryId === 'string' && payload.creditLedgerEntryId) {
      accumulator.prepaidCreditPaymentsEgp = addMoney(accumulator.prepaidCreditPaymentsEgp, payload.amount);
    }
  }
  if (event.eventType === 'commission_earned') {
    accumulator.commissionTotal = addMoney(accumulator.commissionTotal, payload.commissionAmount);
    const delegateId = String(payload.delegateId || '');
    if (delegateId && typeof payload.sourceCreditGrantId === 'string' && payload.sourceCreditGrantId) {
      if (accumulator.currentUnsettledByDelegate[delegateId] === undefined) {
        accumulator.currentUnsettledByDelegate[delegateId] = 0;
      }
      const occurredAt = asDate(event.occurredAt);
      const cutoff = accumulator.latestSettlementByDelegate[delegateId];
      if (!cutoff || (occurredAt && occurredAt > cutoff)) {
        accumulator.currentUnsettledByDelegate[delegateId] = addMoney(
          accumulator.currentUnsettledByDelegate[delegateId],
          payload.commissionAmount
        );
      }
    }
  }
  if (event.eventType === 'vehicle_refunded') {
    accumulator.refundTotal = addMoney(accumulator.refundTotal, payload.refundAmount);
  }
  // Keep pre-existing legacy unsettled balances visible for settlement, but do
  // not treat a legacy recharge as a new fixed 100 EGP commission.
  if (event.eventType === 'recharge_approved' && event.aggregateId) {
    const delegateId = String(payload.delegateId || '');
    if (delegateId) {
      const occurredAt = asDate(event.occurredAt);
      const cutoff = accumulator.latestSettlementByDelegate[delegateId];
      if (!cutoff || (occurredAt && occurredAt > cutoff)) {
        accumulator.currentUnsettledByDelegate[delegateId] = addMoney(
          accumulator.currentUnsettledByDelegate[delegateId] || 0,
          payload.amount
        );
      }
    }
  }

}

/** Adds one ledger entry while retaining only bounded aggregate credit counts. */
export function addFinancialReportCreditLedgerEntry(accumulator: FinancialReportAccumulator, entry: CreditLedgerReportEntry): void {
  const activity = accumulator.creditActivity;
  if (!activity || !inRange(entry.occurredAt, accumulator.options)) return;
  const amount = entry.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0) return;

  switch (entry.kind) {
    case 'paid_grant':
      activity.paidGrantCount = incrementCount(activity.paidGrantCount);
      activity.paidCreditsGranted = addCredits(activity.paidCreditsGranted, amount);
      if (parseMoneyAmount(entry.paymentAmountEgp) !== amount) {
        activity.paidGrantCountWithoutEgpRecord = incrementCount(activity.paidGrantCountWithoutEgpRecord);
        activity.paidCreditsWithoutEgpRecord = addCredits(activity.paidCreditsWithoutEgpRecord, amount);
      }
      break;
    case 'referral_award':
      activity.referralAwardCount = incrementCount(activity.referralAwardCount);
      activity.referralCreditsGranted = addCredits(activity.referralCreditsGranted, amount);
      break;
    case 'trial_grant':
      activity.trialGrantCount = incrementCount(activity.trialGrantCount);
      activity.trialCreditsGranted = addCredits(activity.trialCreditsGranted, amount);
      break;
    case 'regular_entry_debit':
      activity.regularEntryDebitCount = incrementCount(activity.regularEntryDebitCount);
      activity.regularEntryCreditsConsumed = addCredits(activity.regularEntryCreditsConsumed, amount);
      break;
    case 'subscriber_renewal_debit':
      activity.subscriberRenewalCount = incrementCount(activity.subscriberRenewalCount);
      activity.subscriberRenewalCreditsConsumed = addCredits(activity.subscriberRenewalCreditsConsumed, amount);
      break;
    case 'authorized_deletion_restore':
    case 'correction_restore':
      activity.correctionRestoreCount = incrementCount(activity.correctionRestoreCount);
      activity.restoredCredits = addCredits(activity.restoredCredits, amount);
      break;
    case 'correction_delta':
      // Admin corrections can be positive or negative; we track the absolute
      // credit movement under restoredCredits for visibility, signed-agnostic.
      activity.correctionRestoreCount = incrementCount(activity.correctionRestoreCount);
      activity.restoredCredits = addCredits(activity.restoredCredits, amount);
      break;
  }
}

/** Finalizes streamed state into the public report shape. */
export function finishFinancialReport(accumulator: FinancialReportAccumulator): FinancialReport {
  const { grossRechargeTotal, walletTopupTotal, prepaidCreditPaymentsEgp, commissionTotal, refundTotal, historicalSettledTotal } = accumulator;
  const cashCollectedTotal = addMoney(addMoney(grossRechargeTotal, walletTopupTotal), prepaidCreditPaymentsEgp);
  return {
    grossRechargeTotal: round(grossRechargeTotal),
    walletTopupTotal: round(walletTopupTotal),
    prepaidCreditPaymentsEgp: accumulator.options.delegateId ? null : round(prepaidCreditPaymentsEgp),
    cashCollectedTotal,
    commissionTotal: round(commissionTotal),
    refundTotal: round(refundTotal),
    companyNetRevenue: round(cashCollectedTotal - commissionTotal - refundTotal),
    historicalSettledTotal: round(historicalSettledTotal),
    currentUnsettledByDelegate: Object.fromEntries(Object.entries(accumulator.currentUnsettledByDelegate).map(([id, amount]) => [id, round(amount)])),
    creditActivity: accumulator.creditActivity,
  };
}

/** Derives financial totals from immutable events and settlement records without mutating state. */
export function calculateFinancialReport(
  events: FinancialReportEvent[],
  settlements: SettlementRecord[],
  options: FinancialReportOptions = {},
  creditLedgerEntries: CreditLedgerReportEntry[] = []
): FinancialReport {
  const accumulator = createFinancialReportAccumulator(options);
  for (const settlement of settlements) addFinancialReportSettlement(accumulator, settlement);
  for (const event of events) addFinancialReportEvent(accumulator, event);
  for (const entry of creditLedgerEntries) addFinancialReportCreditLedgerEntry(accumulator, entry);
  return finishFinancialReport(accumulator);
}
