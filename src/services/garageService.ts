import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import {
  onSnapshot,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { Garage } from '../types';
import { withRetry } from '../utils';
import { validateGarageCreation } from '../domain/garage/validation';
import { listenerTracker } from '../utils/listenerTracker';

export type { GarageDeletionProgress, GarageDeletionStatus } from './garageDeletionService';

export interface GarageDashboardSummary {
  activeVehicleCount: number;
  entriesToday: number;
  exitsToday: number;
  grossRevenue: number;
  refundTotal: number;
  netRevenue: number;
  projectionVersion: number;
  dateId?: string;
  rebuiltAt?: string;
  source?: 'live_projection_buckets' | 'rebuild';
  report?: {
    totalExited: number;
    hourlyExited: number;
    overnightExited: number;
    grossRevenue: number;
    staffPerformance: Record<string, { name: string; count: number; revenue: number }>;
  };
}

export type GaragePageCursor = string;

export interface GaragePage {
  garages: Garage[];
  lastDoc: GaragePageCursor | null;
  hasMore: boolean;
}

export function isFreshGarageDashboardSummary(summary: GarageDashboardSummary | null | undefined, now = Date.now(), maxAgeMs = 5 * 60 * 1000): summary is GarageDashboardSummary {
  if (!summary?.dateId || !summary.rebuiltAt) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const rebuiltAt = Date.parse(summary.rebuiltAt);
  return summary.dateId === today && Number.isFinite(rebuiltAt) && now - rebuiltAt >= 0 && now - rebuiltAt <= maxAgeMs;
}

type WorkerGaragePage = { garages: Garage[]; hasMore: boolean; nextCursor: string | null };

export const garageService = {
  getDashboardSummary: async (garageId: string): Promise<GarageDashboardSummary> => {
    const response = await apiFetch<{ data: { summary: GarageDashboardSummary } }>(`/api/garages/${encodeURIComponent(garageId)}/dashboard-summary`);
    return response.data.summary;
  },

  getAdminGaragesPage: async (pageSize = 50, lastDocRef: GaragePageCursor | null = null): Promise<GaragePage> => {
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (lastDocRef) params.set('cursor', lastDocRef);
      const page = await apiFetch<WorkerGaragePage>(`/api/garages?${params.toString()}`);
      return { garages: page.garages, lastDoc: page.nextCursor, hasMore: page.hasMore };
    } catch (error) {
      console.warn('Failed to load admin garage page:', error);
      handleFirestoreError(error, OperationType.LIST, 'garages/admin-page');
      throw error;
    }
  },

  subscribeToGarage: (garageId: string, callback: (garage: Garage) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}`);
    const unsub = onSnapshot(doc(db, 'garages', garageId), (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as Garage);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `garages/${garageId}`));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  createGarage: async (data: any, idempotencyKey?: string): Promise<{ success: boolean; id?: string; error?: string }> => {
    const validation = validateGarageCreation(data);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(' — ') };
    }

    try {
      const json = await apiFetch('/api/garages/create', {
        method: 'POST',
        body: idempotencyKey ? { ...data, idempotencyKey } : data,
        timeoutMs: 60_000
      });

      return { success: true, id: json.id };
    } catch (err: any) {
      if (err.message === 'PIN_ALREADY_TAKEN') {
        // Fallback or detailed error handled by server, we can match and format
        return { success: false, error: 'رمز الدخول مستخدم بالفعل' };
      }
      return { success: false, error: err.message || 'حدث خطأ أثناء إنشاء الجراج' };
    }
  },

  updateGarage: async (id: string, data: Partial<Garage>) => {
    try {
      const newPin = data.pin || (data as any).ownerPin;
      if (newPin) {
        await apiFetch('/api/people/update-pin', {
          method: 'POST',
          body: { entityType: 'garages', entityId: id, newPin }
        });
      }

      const payload: any = { ...data };
      delete payload.pin;
      delete payload.ownerPin;

      if (newPin) {
        payload.currentSessionId = null;
      }

      if (Object.keys(payload).length > 0) {
        await apiFetch('/api/garages/update', {
          method: 'POST',
          body: { id, ...payload }
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${id}`);
      throw error;
    }
  },

  getGarageById: async (id: string) => {
    try {
      const snapshot = await getDoc(doc(db, 'garages', id));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as Garage;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `garages/${id}`);
      throw error;
    }
  },

  claimOrRefreshGarageSession: async (
    garageId: string,
    sessionId: string,
    _serverTimeOffset = 0
  ) => {
    const garageRef = doc(db, 'garages', garageId);
    const sessionRef = doc(db, 'garage_sessions', garageId);

    return withRetry(() => runTransaction(db, async (transaction) => {
      const garageSnap = await transaction.get(garageRef);
      if (!garageSnap.exists()) throw new Error('GARAGE_NOT_FOUND');

      const data = garageSnap.data();

      transaction.update(garageRef, {
        currentSessionId: sessionId,
        lastActive: serverTimestamp(),
      });
      transaction.set(sessionRef, {
        garageId,
        sessionId,
        uid: auth.currentUser?.uid || null,
        lastActive: serverTimestamp(),
      }, { merge: true });

      return { ...data, id: garageSnap.id, currentSessionId: sessionId };
    }));
  },

  recalculateCarsInside: async (garageId: string): Promise<number> => {
    try {
      const res = await apiFetch('/api/garages/recalculate-cars-inside', {
        method: 'POST',
        body: { garageId }
      });
      return res.count || 0;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/recalculateCarsInside`);
      throw error;
    }
  },


};
