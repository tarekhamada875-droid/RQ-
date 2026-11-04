/**
 * One-time security backfill: null legacy plaintext / hash PIN fields from
 * client-readable tenant documents.
 *
 * Background:
 *   PR #408 ("P4.2: remove legacy PIN verification") removed every code path
 *   that reads plaintext / legacy-hash PIN fields from tenant docs. PIN
 *   credentials now live exclusively in the server-only `private_pins`
 *   collection (denied to clients via firestore.rules). However, the legacy
 *   fields (`pin`, `ownerPin`, `adminPin`, `pinLookupHash`) were never purged
 *   from existing docs — they sit there as data residue. A garage owner who
 *   `get`s their own `garages/{id}` doc can still read the old plaintext PIN,
 *   which may be reused on other services.
 *
 *   The lazy migration in `migratePinToHash` (server/utils.ts) only cleanses
 *   a doc when that user next logs in. Users who haven't logged in since
 *   PR #408 still have plaintext PINs exposed. This script proactively
 *   cleanses ALL tenant docs in one sweep.
 *
 * Safety:
 *   - Per-doc: only nulls fields that exist. Skips docs that are already clean.
 *   - Per-collection: processes garages, delegates, staff, admin_settings.
 *   - Idempotent: re-running is a no-op once all docs are clean.
 *   - Does NOT touch `private_pins` or `pin_reservations` — those are the
 *     authoritative stores and must be preserved.
 *   - Does NOT require users to re-enter their PIN — `private_pins` is the
 *     login source of truth; the legacy fields being nulled are not read by
 *     any code path.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   npx tsx scripts/backfill-null-legacy-pin-fields.ts [--dry-run]
 *
 * Output:
 *   Prints per-collection counts: scanned, cleansed, skipped, errors.
 *   Exit code 0 on success, 1 if any error occurred.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');
const app = initializeApp({ credential: applicationDefault() });
const db = getFirestore(app);

const LEGACY_PIN_FIELDS = ['pin', 'ownerPin', 'adminPin', 'pinLookupHash'] as const;

interface CollectionResult {
  collection: string;
  scanned: number;
  cleansed: number;
  skipped: number;
  errors: number;
}

async function processCollection(collectionName: string): Promise<CollectionResult> {
  const result: CollectionResult = { collection: collectionName, scanned: 0, cleansed: 0, skipped: 0, errors: 0 };
  const snapshot = await db.collection(collectionName).get();
  result.scanned = snapshot.size;

  for (const docSnap of snapshot.docs) {
    try {
      const data = docSnap.data() || {};
      const updates: Record<string, null> = {};
      for (const field of LEGACY_PIN_FIELDS) {
        if (field in data && data[field] !== null && data[field] !== undefined) {
          updates[field] = null;
        }
      }

      if (Object.keys(updates).length === 0) {
        result.skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] ${collectionName}/${docSnap.id}: would null ${Object.keys(updates).join(', ')}`);
        result.cleansed += 1;
      } else {
        await docSnap.ref.set(updates, { merge: true });
        console.log(`[cleansed] ${collectionName}/${docSnap.id}: nulled ${Object.keys(updates).join(', ')}`);
        result.cleansed += 1;
      }
    } catch (err: any) {
      result.errors += 1;
      console.error(`[error] ${collectionName}/${docSnap.id}:`, err?.message || err);
    }
  }

  return result;
}

async function main(): Promise<void> {
  console.log(`=== PIN legacy-field backfill (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`Project: ${app.options.projectId || '(default)'}`);
  console.log('');

  const collections = ['garages', 'delegates', 'staff', 'admin_settings'];
  const results: CollectionResult[] = [];

  for (const coll of collections) {
    try {
      console.log(`--- ${coll} ---`);
      const r = await processCollection(coll);
      results.push(r);
      console.log(`  scanned=${r.scanned} cleansed=${r.cleansed} skipped=${r.skipped} errors=${r.errors}`);
    } catch (err: any) {
      console.error(`FATAL processing ${coll}:`, err?.message || err);
      results.push({ collection: coll, scanned: 0, cleansed: 0, skipped: 0, errors: 1 });
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  const totals = results.reduce(
    (acc, r) => ({
      scanned: acc.scanned + r.scanned,
      cleansed: acc.cleansed + r.cleansed,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors,
    }),
    { scanned: 0, cleansed: 0, skipped: 0, errors: 0 }
  );
  console.log(`  total scanned=${totals.scanned} cleansed=${totals.cleansed} skipped=${totals.skipped} errors=${totals.errors}`);

  if (totals.errors > 0) {
    console.error('Backfill completed with errors.');
    process.exit(1);
  }
  console.log('Backfill complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
