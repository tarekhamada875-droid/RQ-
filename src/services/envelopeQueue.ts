/**
 * OFFLINE STEP 2 (2026-11-24, owner-approved "notebook first, bank second"):
 * the envelope drawer.
 *
 * Every offline check-in / check-out writes one "envelope" here. An envelope
 * is the exact payload the Worker endpoint expects plus its own idempotency
 * key, so flushing reuses the SAME road, the SAME server validation and the
 * SAME duplicate protection as a live transaction:
 *   - the server re-derives subscriber status itself (checkIn.ts:
 *     isSubscriberAuthoritative) — the phone's guess is advisory only;
 *   - the server re-computes the fee itself (checkOut.ts:
 *     calculateVehicleCost) — the phone's receipt preview is provisional;
 *   - replays of the same key return the originally committed result.
 *
 * FIFO order matters: a queued check-in is flushed before its own queued
 * check-out, so the server can compute the exit fee from the entry time it
 * just created.
 *
 * Storage: localStorage (survives app restarts and phone reboots). The key
 * is EXEMPT from the logout purge (see useGarageSession): envelopes are real
 * garage business — cars that are physically inside — and must reach the
 * bank even if the operator logs out first.
 *
 * This module is a plain store with no React and no Firestore observers: the
 * UI reads it through useSyncExternalStore via usePendingEnvelopeCount.
 */

export type EnvelopeKind = 'checkin' | 'checkout';
export type EnvelopeStatus = 'pending' | 'rejected';

export interface OfflineEnvelope {
  /** Doubles as the idempotency key sent to the Worker on every flush try. */
  id: string;
  garageId: string;
  kind: EnvelopeKind;
  /** Display-formatted plate (e.g. "س ن ا 1234"). */
  plateNumber: string;
  /** Normalized plate — identical to the vehicle doc ID on the server. */
  plateRaw: string;
  vehicleType: 'hourly' | 'overnight';
  /** Phone clock at entry (server-synced via useServerTimeNow). */
  entryTimeIso: string;
  staffName: string;
  staffId: string | null;
  isSubscriber: boolean;
  /**
   * OFFLINE STEP 2b (checkout envelopes only): the receipt preview's phone
   * cost. The bank re-computes the authoritative fee on flush — this number
   * exists so the flush can roll the PROVISIONAL revenue counters back out
   * of the notebook when the bank resolves (duplicate exit) or refuses the
   * envelope instead of committing it.
   */
  phoneCost?: number;
  createdAt: number;
  attempts: number;
  status: EnvelopeStatus;
  /** Last failure note — shown when the operator inspects the drawer. */
  lastError?: string;
}

const STORAGE_KEY = 'app_offline_envelopes';

const listeners = new Set<() => void>();
// Monotonic version bumped on every write — gives useSyncExternalStore a
// cheap, referentially-stable snapshot number.
let version = 0;

function readAll(): OfflineEnvelope[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineEnvelope =>
      Boolean(item) &&
      typeof (item as OfflineEnvelope).id === 'string' &&
      typeof (item as OfflineEnvelope).garageId === 'string' &&
      ((item as OfflineEnvelope).kind === 'checkin' || (item as OfflineEnvelope).kind === 'checkout'),
    );
  } catch {
    // Corrupted or unavailable storage must never crash the app — start
    // empty rather than lose the whole session over one bad record.
    return [];
  }
}

function writeAll(envelopes: OfflineEnvelope[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelopes));
  } catch {
    // Storage full/disabled: keep the in-memory operation going; the flush
    // loop still holds the envelope for this session via the return value.
  }
  version += 1;
  listeners.forEach((notify) => notify());
}

export const envelopeQueue = {
  /** FIFO append. Returns the stored envelope (status 'pending'). */
  enqueue(input: Omit<OfflineEnvelope, 'attempts' | 'status'>): OfflineEnvelope {
    const envelope: OfflineEnvelope = { ...input, attempts: 0, status: 'pending' };
    const all = readAll();
    // Hard duplicate guard: the same idempotency key must never queue twice
    // (double tap, re-render race). The caller-level ALREADY_INSIDE guard is
    // the UX path; this is the data-integrity backstop.
    if (all.some((item) => item.id === envelope.id)) return envelope;
    all.push(envelope);
    writeAll(all);
    return envelope;
  },

  list(garageId?: string): OfflineEnvelope[] {
    const all = readAll();
    return garageId ? all.filter((item) => item.garageId === garageId) : all;
  },

  pendingCount(garageId?: string): number {
    return envelopeQueue
      .list(garageId)
      .filter((item) => item.status === 'pending')
      .length;
  },

  rejectedCount(garageId?: string): number {
    return envelopeQueue
      .list(garageId)
      .filter((item) => item.status === 'rejected')
      .length;
  },

  /** Mirror lookup for the RegistrationCard: is this plate a car that was
   *  checked in on THIS phone and has not reached the bank yet? */
  findPendingCheckIn(garageId: string, plateRaw: string): OfflineEnvelope | null {
    return envelopeQueue
      .list(garageId)
      .find((item) =>
        item.kind === 'checkin' &&
        item.status === 'pending' &&
        item.plateRaw === plateRaw,
      ) ?? null;
  },

  /** Mirror lookup for the RegistrationCard: was this plate already checked
   *  out on THIS phone (envelope queued) while the cached Firestore doc may
   *  still say 'inside'? Prevents offering a second exit for the same car. */
  hasPendingCheckout(garageId: string, plateRaw: string): boolean {
    return envelopeQueue
      .list(garageId)
      .some((item) =>
        item.kind === 'checkout' &&
        item.status === 'pending' &&
        item.plateRaw === plateRaw,
      );
  },

  /** Called after a successful flush: the bank confirmed — the envelope
   *  leaves the drawer (the server truth now lives in Firestore). */
  remove(id: string): void {
    writeAll(readAll().filter((item) => item.id !== id));
  },

  /** Called after a failed flush try. Network-shaped failures keep the
   *  envelope 'pending' (retry on the next trigger); business rejections
   *  (no credits, already inside/outside…) park it as 'rejected' so the
   *  operator can see what the bank refused — never silently dropped. */
  markFailed(id: string, error: string, rejected: boolean): void {
    const all = readAll();
    const index = all.findIndex((item) => item.id === id);
    if (index === -1) return;
    all[index] = {
      ...all[index],
      attempts: all[index].attempts + 1,
      lastError: error.slice(0, 300),
      status: rejected ? 'rejected' : all[index].status,
    };
    writeAll(all);
  },

  /** External-store plumbing for useSyncExternalStore consumers. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Snapshot for useSyncExternalStore: a stable number that changes only
   *  when the drawer content changes. */
  getSnapshotVersion(): number {
    return version;
  },
};
