import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { Announcement } from '../types';

export const adminAnnouncementService = {
  // createAnnouncement, deleteAnnouncement, toggleAnnouncementActive: removed.
  // Dead code — the admin announcements management UI was retired.
  // The server endpoints still exist but nobody calls them from the client.
  // onAnnouncementsChange is still used by the garage dashboard to display announcements.

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
};
