import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { Announcement } from '../types';

export const adminAnnouncementService = {
  createAnnouncement: async (announcement: Omit<Announcement, 'id' | 'createdAt'>): Promise<string> => {
    try {
      const res = await apiFetch('/api/admin/announcements/create', {
        method: 'POST',
        body: announcement
      });
      return res.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements');
      throw error;
    }
  },


  deleteAnnouncement: async (id: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/announcements/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `announcements/${id}`);
      throw error;
    }
  },


  toggleAnnouncementActive: async (id: string, isActive: boolean): Promise<void> => {
    try {
      await apiFetch('/api/admin/announcements/toggle', {
        method: 'POST',
        body: { id, isActive }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `announcements/${id}`);
      throw error;
    }
  },


  onAnnouncementsChange: (callback: (announcements: Announcement[]) => void): (() => void) => {
    const trackerUnsub = listenerTracker.register('announcements');
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'announcements'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  // System Config
};
