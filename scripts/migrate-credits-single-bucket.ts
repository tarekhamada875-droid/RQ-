/**
 * One-time migration: collapse legacy three-bucket credit balances
 * (creditBalance: { paid, referral, trial }) into the single `credits` field.
 *
 * Run AFTER deploying the single-bucket Worker code. The Worker reads
 * `garage.credits ?? 0` and never reads `creditBalance`, so this migration
 * only needs to populate `credits` for existing garages that still have the
 * old object shape. The legacy `creditBalance` field is left in place
 * (harmless); a follow-up cleanup can null it out later if desired.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   npx tsx scripts/migrate-credits-single-bucket.ts [--dry-run]
 *
 * Safety:
 * - Skips garages that already have `credits` set (number).
 * - Skips garages with neither `credits` nor `creditBalance`.
 * - Sums paid + referral + trial from the legacy object; clamps negatives to 0.
 * - Writes one credit_ledger entry per migrated garage, kind=correction_delta,
 *   so the migration is auditable.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app);

const MIGRATION_ACTOR_UID = 'system-migration-2026-10-29';
const MIGRATION_IDEMPOTENCY_KEY = 'migration:single-bucket:2026-10-29';

async function main() {
  const snapshot = await db.collection('garages').get();
  console.log(`[migrate] scanned ${snapshot.size} garages (dryRun=${dryRun})`);

  let migrated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const garageId = docSnap.id;

    // Skip if credits is already a number — already migrated.
    if (typeof data.credits === 'number') {
      skipped += 1;
      continue;
    }

    const cb = data.creditBalance;
    if (!cb || typeof cb !== 'object') {
      // No legacy balance to migrate from; set credits=0 so the field exists.
      batch.set(docSnap.ref, { credits: 0 }, { merge: true });
    } else {
      const paid = Math.max(0, Number(cb.paid || 0));
      const referral = Math.max(0, Number(cb.referral || 0));
      const trial = Math.max(0, Number(cb.trial || 0));
      const total = paid + referral + trial;
      const nowIso = new Date().toISOString();

      batch.set(docSnap.ref, { credits: total }, { merge: true });

      // Write a migration ledger entry so the new total is auditable.
      const entryId = `${garageId}:correction_delta:${MIGRATION_IDEMPOTENCY_KEY}:${encodeURIComponent(nowIso)}:0:${total}`;
      batch.set(db.doc(`credit_ledger/${entryId}`), {
        entryId,
        garageId,
        kind: 'correction_delta',
        amount: total,
        balanceBefore: 0,
        balanceAfter: total,
        actorUid: MIGRATION_ACTOR_UID,
        actorRole: 'system',
        reason: 'One-time migration: collapsed paid+referral+trial into single balance',
        occurredAt: nowIso,
        idempotencyKey: `${MIGRATION_IDEMPOTENCY_KEY}:${garageId}`,
        source: 'single_bucket_migration',
      });
    }

    migrated += 1;
    batchCount += 1;
    if (batchCount >= 400) {
      console.log(`[migrate] committing batch of ${batchCount}...`);
      if (!dryRun) await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    console.log(`[migrate] committing final batch of ${batchCount}...`);
    if (!dryRun) await batch.commit();
  }

  console.log(`[migrate] done. migrated=${migrated} skipped=${skipped} dryRun=${dryRun}`);
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
