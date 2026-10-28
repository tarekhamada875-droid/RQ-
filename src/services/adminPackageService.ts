import { db } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Package } from '../types';
import { isCreditBundlePackage } from '../utils/packageCatalog';
import { listenerTracker } from '../utils/listenerTracker';

export const adminPackageService = {
  addPackage: async (pkg: Omit<Package, 'id' | 'createdAt' | 'isActive'>): Promise<void> => {
    await apiFetch('/api/admin/packages/create', {
      method: 'POST',
      body: pkg
    });
  },


  deletePackage: async (id: string): Promise<void> => {
    await apiFetch('/api/admin/packages/delete', {
      method: 'POST',
      body: { id }
    });
  },


  subscribeToPackages: (callback: (packages: Package[]) => void) => {
    const trackerUnsubscribe = listenerTracker.register('packages');
    const colRef = collection(db, 'packages');
    const packagesQuery = query(colRef, where('catalogType', '==', 'credit_bundle'));
    const unsubscribe = onSnapshot(packagesQuery, async (snapshot) => {
      if (snapshot.empty) {
        try {
          localStorage.setItem('app_packages_cache', JSON.stringify([]));
        } catch {
          // Cache persistence is best effort; the live snapshot remains authoritative.
        }
        callback([]);
        return;
      }
      
      const activePkgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(isCreditBundlePackage);
      
      try {
        localStorage.setItem('app_packages_cache', JSON.stringify(activePkgs));
      } catch {
        // Cache persistence is best effort; subscribers still receive the live packages.
      }
      
      callback(activePkgs);
    }, (err) => {
      console.warn('[AdminService] Error listening to packages collection, falling back to cache:', err);
      try {
        const cached = localStorage.getItem('app_packages_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            callback(parsed.filter(isCreditBundlePackage));
            return;
          }
        }
      } catch {
        // Invalid or unavailable cache falls back to an empty package list.
      }
      callback([]);
    });
    return () => {
      try {
        unsubscribe();
      } finally {
        trackerUnsubscribe();
      }
    };
  },

  // Subscribers
};
