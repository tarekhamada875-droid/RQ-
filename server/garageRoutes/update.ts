/**
 * Handler 2: Update Garage (POST /api/garages/update), including the
 * server-side 30-day rate-change cooldown and the transactional
 * trial-credit grant on approval.
 *
 * Body moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { withAdmin, withErrorHandler } from '../routes/combinators';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { grantTrialCredits, materializeCreditLedgerEntry } from '../domain/prepaidCreditLedger';
import { MAINTAINED_SUMMARY_VERSION, maintainedAdminSummaryRef } from '../workerMaintenance';
import { validateId } from '../validation';

export function registerGarageUpdate(app: WorkerApp): void {
// Handler 2: Update Garage (POST /api/garages/update)
app.post('/api/garages/update', requireWorkerAuth, withErrorHandler(withAdmin(async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { id: rawId, ...data } = body || {};
    // Audit N11 (Phase 1, 2026-11-06): validate the id using validateId
    // (rejects whitespace, path-traversal chars, >128 chars). Previously
    // just checked truthiness — an attacker could send id with special
    // characters that would reach Firestore doc paths.
    const id = validateId(rawId, 'garageId', true);

    const retiredUpdateFields = new Set([
      'billingModel', 'commissionPerVehicle', 'monthlySubscriptionFee', 'dailyCapacity', 'capacity', 'allowMonthlySubscribers',
      'activePackageName', 'packageName', 'balance', 'balanceExpiry', 'balanceDays', 'carsInside',
      'lastBalanceDeduction', 'lastPaidFriday', 'lastRechargeAmount', 'lastRechargeDate', 'lastRechargePackageName',
      'totalRechargedCars', 'referralBonusBalance', 'referralRewardClaimed', 'referralRewardAwardedAt',
      'creditBalance', 'credits'
    ]);
    const retiredUpdateField = Object.keys(data).find((field) => retiredUpdateFields.has(field) && data[field] !== undefined);
    if (retiredUpdateField) return c.json({ success: false, error: 'RETIRED_GARAGE_FIELD', field: retiredUpdateField }, 400);

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowedKeys = [
      'name', 'phone', 'hourlyRate', 'overnightRate',
      'status', 'isLocked', 'lockReason', 'isSuspended', 'isMaintenanceMode',
      'maintenanceMessage', 'assignedDelegateId', 'currentSessionId',
      'hasMonthlySubscribers', 'checkInSound', 'checkOutSound', 'ownerName',
      'shimmerColor',
      'referredByGarageId', 'referredByGarageName', 'referrerId', 'referrerName', 'createdByDelegateId', 'createdByDelegateName'
    ];
    for (const key of allowedKeys) {
      if (key in data && data[key] !== undefined) {
        updates[key] = data[key];
      }
    }

    // NOTE (audit N3, 2026-11-06): `lastRateChangeDate` is intentionally NOT
    // in allowedKeys. The server sets it authoritatively below when rates
    // change, ignoring any client-supplied value. The previous version
    // silently dropped any client-supplied `lastRateChangeDate` (because
    // it wasn't in allowedKeys) but ALSO didn't enforce the 30-day cooldown
    // server-side — so a client could bypass the cooldown by sending a
    // tampered `lastRateChangeDate: new Date(0)` (which was ignored) AND
    // calling the API directly with new rates (which the server happily
    // accepted without checking the existing lastRateChangeDate in the
    // garage doc). The cooldown was client-side only. Now it's enforced
    // server-side inside the transaction below.

    // Atomic garage update + trial-credit grant on approval.
    //
    // Previously: the `update(updates)` and the trial-credits grant
    // happened as separate non-transactional writes. Two concurrent
    // approvals could both observe `isTrial === false`, both grant
    // 100 credits, and one grant would be silently dropped (lost-update).
    // Worse, if the trial grant failed, the garage was already moved to
    // 'approved' status without the credits — a financial inconsistency.
    //
    // Now: the entire update + trial grant happens in one transaction.
    // The `isTrial` flag is the idempotency guard — once it's true inside
    // the same transaction, no concurrent approval can re-grant.
    //
    // Audit ref: Phase 0 / N8 (consolidated audit, 2026-11-06).
    const RATE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = new Date();
    // Detect a rate-change request: admin is updating hourlyRate and/or
    // overnightRate to a different value than what's stored.
    const isRateChangeRequest =
      ('hourlyRate' in updates && updates.hourlyRate !== undefined) ||
      ('overnightRate' in updates && updates.overnightRate !== undefined);
    await adminDb.runTransaction(async (t: any) => {
      const garageRef = adminDb.collection('garages').doc(id);
      const garageSnap = await t.get(garageRef);
      const garageData = garageSnap.data() || {};

      // Server-side 30-day rate-change cooldown (audit N3).
      // The client-side check in src/utils/businessRules.ts is advisory;
      // this is the authoritative enforcement. Reading lastRateChangeDate
      // from the doc (NOT from the request body) is what makes the cooldown
      // tamper-proof.
      if (isRateChangeRequest) {
        const storedLastChange = garageData.lastRateChangeDate;
        let lastChangeMs: number | null = null;
        if (storedLastChange) {
          if (typeof storedLastChange === 'object' && storedLastChange && typeof (storedLastChange as any).toMillis === 'function') {
            lastChangeMs = (storedLastChange as any).toMillis();
          } else if (storedLastChange instanceof Date) {
            lastChangeMs = storedLastChange.getTime();
          } else if (typeof storedLastChange === 'string' || typeof storedLastChange === 'number') {
            const parsed = Date.parse(String(storedLastChange));
            lastChangeMs = Number.isFinite(parsed) ? parsed : null;
          }
        }
        if (lastChangeMs !== null && (now.getTime() - lastChangeMs) < RATE_CHANGE_COOLDOWN_MS) {
          const daysRemaining = Math.ceil((RATE_CHANGE_COOLDOWN_MS - (now.getTime() - lastChangeMs)) / (24 * 60 * 60 * 1000));
          const err = new Error('RATE_CHANGE_COOLDOWN_ACTIVE');
          (err as any).statusCode = 409;
          (err as any).daysRemaining = Math.max(1, daysRemaining);
          (err as any).nextAllowedDate = new Date(lastChangeMs + RATE_CHANGE_COOLDOWN_MS).toISOString();
          throw err;
        }
        // Stamp the rate-change timestamp authoritatively — server-side
        // only, never client-supplied.
        updates.lastRateChangeDate = now;
      }

      // Apply the field updates the admin requested. Use t.update (not
      // t.set with merge) so that a missing garage doc throws the
      // 'Document not found' error the API contract relies on.
      t.update(garageRef, updates);

      // Trial credits on approval: when an admin sets status → 'approved'
      // for the first time, grant 50 trial credits automatically IF the
      // garage hasn't already received them. This replaces the delegate-side
      // trial toggle that was removed from the create-garage modal — the
      // delegate no longer decides; the credits just happen on approval.
      if (updates.status === 'approved' && !garageData.isTrial) {
        const trialTransition = grantTrialCredits({
          balance: Number(garageData.credits || 0),
          amount: 50,
          garageId: id,
          actorUid: user?.uid || 'admin',
          actorRole: 'admin',
          reason: 'Trial credits granted on garage approval',
          occurredAt: now.toISOString(),
          idempotencyKey: `garage-approve:${id}:trial`,
        });
        if (trialTransition.ok === false) throw new Error(trialTransition.error);
        const trialLedger = materializeCreditLedgerEntry(trialTransition.value.entry);
        if (trialLedger.ok === false) throw new Error(trialLedger.error);

        t.set(adminDb.doc(`credit_ledger/${trialLedger.value.entryId}`), {
          ...trialLedger.value,
          source: 'garage_approval_trial',
        });
        // Mark isTrial + apply new credit balance in the same merge — this
        // is the write that closes the lost-update window.
        t.set(garageRef, {
          credits: trialTransition.value.balance,
          isTrial: true,
          updatedAt: now,
        }, { merge: true });
      }
    });

    // Only mark the admin summary stale when fields that actually affect the
    // summary counters change (isLocked → lockedGarages, status → activeGarages).
    // Routine edits (name, phone, rates, colors, etc.) do NOT require a full
    // collection scan to recompute the summary.
    const summaryAffectingFields = new Set(['isLocked', 'status', 'isTrial']);
    const affectsSummary = Object.keys(updates).some((key) => summaryAffectingFields.has(key));
    if (affectsSummary) {
      await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    }
    return c.json({ success: true });
  // withErrorHandler handles try/catch + RATE_CHANGE_COOLDOWN_ACTIVE (C3)
}), 'Garage'));
}
