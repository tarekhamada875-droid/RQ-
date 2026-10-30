import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { generateIdempotencyKey } from '../types/apiContracts';
import { collection, collectionGroup, query, where, onSnapshot, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { Subscriber } from '../types';
import type { SubscriberPageCursor, SubscriberPageInfo, SubscriberPage } from './adminServiceTypes';

const SUBSCRIBER_PAGE_SIZE = 50;

export const adminSubscriberService = {
  subscribeToSubscribers: (garageId: string, callback: (subscribers: Subscriber[], page: SubscriberPageInfo) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/subscribers`);
    const q = query(
      collection(db, `garages/${garageId}/subscribers`),
      orderBy('createdAt', 'desc'),
      limit(SUBSCRIBER_PAGE_SIZE + 1)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const pageDocs = snapshot.docs.slice(0, SUBSCRIBER_PAGE_SIZE);
      const list = pageDocs.map(doc => ({ id: doc.id, ...doc.data() } as Subscriber));
      callback(list, {
        lastDoc: pageDocs[pageDocs.length - 1] || null,
        hasMore: snapshot.docs.length > SUBSCRIBER_PAGE_SIZE
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, `garages/${garageId}/subscribers`));

    return () => {
      unsub();
      trackerUnsub();
    };
  },


  getMoreSubscribers: async (garageId: string, lastDoc: SubscriberPageCursor): Promise<SubscriberPage> => {
    const q = query(
      collection(db, `garages/${garageId}/subscribers`),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(SUBSCRIBER_PAGE_SIZE + 1)
    );
    const snapshot = await getDocs(q);
    const pageDocs = snapshot.docs.slice(0, SUBSCRIBER_PAGE_SIZE);
    return {
      subscribers: pageDocs.map(doc => ({ id: doc.id, ...doc.data() } as Subscriber)),
      lastDoc: pageDocs[pageDocs.length - 1] || lastDoc,
      hasMore: snapshot.docs.length > SUBSCRIBER_PAGE_SIZE
    };
  },


  addSubscriber: async (garageId: string, subscriberData: any) => {
    try {
      const res = await apiFetch('/api/subscribers/add', {
        method: 'POST',
        body: { garageId, subscriberData, idempotencyKey: generateIdempotencyKey('subscriber_add') }
      });
      return res.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `garages/${garageId}/subscribers`);
      throw error;
    }
  },


  renewSubscriber: async (garageId: string, subscriberId: string, newDates: { startDate: string, endDate: string }) => {
    try {
      await apiFetch('/api/subscribers/renew', {
        method: 'POST',
        body: { garageId, subscriberId, newDates, idempotencyKey: generateIdempotencyKey('subscriber_renew') }
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/subscribers/${subscriberId}/renew`);
      throw error;
    }
  },


  updateSubscriber: async (garageId: string, subscriberId: string, subscriberData: any) => {
    try {
      await apiFetch('/api/subscribers/update', {
        method: 'POST',
        body: { garageId, subscriberId, subscriberData, idempotencyKey: generateIdempotencyKey('subscriber_update') }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/subscribers`);
      throw error;
    }
  },


  deleteSubscriber: async (garageId: string, subscriberId: string) => {
    try {
      await apiFetch('/api/subscribers/delete', {
        method: 'POST',
        body: { garageId, subscriberId, idempotencyKey: generateIdempotencyKey('subscriber_delete') }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `garages/${garageId}/subscribers`);
      throw error;
    }
  },


  getSubscriberByPlateOnce: async (garageId: string, rawPlate: string): Promise<Subscriber | null> => {
    try {
      const q = query(
        collection(db, `garages/${garageId}/subscribers`),
        where('plateNumberRaw', '==', rawPlate),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        return { id: docSnap.id, ...docSnap.data() } as Subscriber;
      }
      return null;
    } catch (err) {
      console.error('Error fetching subscriber by plate:', err);
      throw err;
    }
  },

  /**
   * Searches subscribers across ALL garages in a single collectionGroup query.
   * Replaces the O(N) per-garage loop in PlateLookupModal.
   * Returns subscribers with their parent garageId (extracted from the doc path).
   */
  getSubscribersByPlateAcrossGarages: async (rawPlate: string): Promise<Array<Subscriber & { garageId: string }>> => {
    const q = query(
      collectionGroup(db, 'subscribers'),
      where('plateNumberRaw', '==', rawPlate),
      limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => {
      const data = doc.data() as Subscriber;
      // Extract garageId from path: garages/{garageId}/subscribers/{subscriberId}
      const pathParts = doc.ref.path.split('/');
      const garageId = pathParts.length >= 2 ? pathParts[1] : '';
      return { ...data, id: doc.id, garageId };
    });
  },

};
