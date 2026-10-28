export function sanitizeDelegateDoc<T extends Record<string, any>>(data: T): Omit<T, 'pin' | 'ownerPin' | 'adminPin' | 'pinHash' | 'pinLookupHash'> {
  const sanitized = { ...data };
  delete sanitized.pin;
  delete sanitized.ownerPin;
  delete sanitized.adminPin;
  delete sanitized.pinHash;
  delete sanitized.pinLookupHash;
  return sanitized;
}

import { normalizePlateRaw } from './validation';

export function safeDateMillis(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

type SubscriberLookupInput = {
  subscriberId?: string;
  plateRaw?: string;
  plateNumber?: string;
  phone?: string;
};

type SubscriberLookupReader = (target: any) => Promise<any>;

function deterministicSubscriberId(plateRaw: string): string {
  return `plate_${Buffer.from(plateRaw).toString('base64url')}`;
}

export async function lookupSubscriber(
  subscriberCollection: any,
  input: SubscriberLookupInput,
  read: SubscriberLookupReader = (target) => target.get()
): Promise<{ id: string; [key: string]: any } | null> {
  if (input.subscriberId) {
    const subscriberSnap = await read(subscriberCollection.doc(input.subscriberId));
    if (subscriberSnap.exists) return { id: subscriberSnap.id, ...subscriberSnap.data() };
  }

  const normalizedRaw = input.plateRaw ? normalizePlateRaw(input.plateRaw) || input.plateRaw : '';
  if (normalizedRaw) {
    const deterministicSnap = await read(subscriberCollection.doc(deterministicSubscriberId(normalizedRaw)));
    if (deterministicSnap.exists) return { id: deterministicSnap.id, ...deterministicSnap.data() };
  }

  const fallbackTargets: Array<{ precedence: number; target: any }> = [];
  if (normalizedRaw) {
    fallbackTargets.push({ precedence: 0, target: subscriberCollection.where('plateNumberRaw', '==', normalizedRaw).limit(1) });
  }
  if (input.plateNumber) {
    fallbackTargets.push({ precedence: 1, target: subscriberCollection.where('plateNumber', '==', input.plateNumber).limit(1) });
  }
  if (input.phone) {
    fallbackTargets.push({ precedence: 2, target: subscriberCollection.where('phone', '==', input.phone).limit(1) });
  }
  if (fallbackTargets.length === 0) return null;

  const fallbackSnapshots = await Promise.all(fallbackTargets.map(({ target }) => read(target)));
  const candidates = fallbackSnapshots.flatMap((snapshot, index) =>
    snapshot.docs.length > 0
      ? [{ precedence: fallbackTargets[index].precedence, snapshot: snapshot.docs[0] }]
      : []
  );
  const seenIds = new Set<string>();
  candidates.sort((left, right) => left.precedence - right.precedence);
  for (const candidate of candidates) {
    if (seenIds.has(candidate.snapshot.id)) continue;
    seenIds.add(candidate.snapshot.id);
    return { id: candidate.snapshot.id, ...candidate.snapshot.data() };
  }
  return null;
}
