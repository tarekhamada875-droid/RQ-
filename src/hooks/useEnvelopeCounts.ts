import { useSyncExternalStore } from 'react';
import { envelopeQueue } from '../services/envelopeQueue';

/**
 * OFFLINE STEP 2: live count of envelopes still waiting in the drawer for
 * this garage (plus rejected ones the bank refused). Backs the dashboard's
 * pending chip. Plain external store — no Firestore observers involved.
 */
export function useEnvelopeCounts(garageId: string | undefined): { pending: number; rejected: number } {
  const version = useSyncExternalStore(
    envelopeQueue.subscribe,
    envelopeQueue.getSnapshotVersion,
    envelopeQueue.getSnapshotVersion,
  );
  // version only exists to re-trigger reads on drawer mutations.
  void version;
  const pending = garageId ? envelopeQueue.pendingCount(garageId) : 0;
  const rejected = garageId ? envelopeQueue.rejectedCount(garageId) : 0;
  // Recomputed on every snapshot version change (and every render — cheap:
  // a small localStorage array read).
  return { pending, rejected };
}
