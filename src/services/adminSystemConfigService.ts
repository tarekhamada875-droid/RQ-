import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { onSnapshot, doc } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { SystemConfig } from '../types';

const getSystemConfig = async (): Promise<SystemConfig | null> => {
    // system_config is private; use local/default bootstrap until Firebase sign-in.
    if (!auth.currentUser) return null;

    try {
      const apiRes = await apiFetch<{ success?: boolean; config?: SystemConfig }>('/api/system-config');
      return apiRes?.success && apiRes.config ? apiRes.config : null;
    } catch (error) {
      console.error('Error fetching system config:', error);
      return null;
    }
};

export const adminSystemConfigService = {
  getSystemConfig,
  subscribeToSystemConfig: (callback: (config: SystemConfig | null) => void) => {
    const trackerUnsub = listenerTracker.register('system_config');
    const defaults: SystemConfig = { 
      defaultTrialDays: 2, 
      warningDaysThreshold: 3, 
      supportPhone: '01000000000',
      walletNumber: '',
      monthlySubscribersFlatFee: 250,
      monthlySubscribersSurchargePercent: 25,
      referralFeePerRenewal: 50,
      delegatePackageCommissions: {
        daily: 5,
        weekly: 15,
        biweekly: 25,
        monthly: 50
      },
      isMaintenanceMode: false,
      maintenanceMessage: '',
      adminColor: '#10b981'
    };

    // Server API fetch to ensure real DB values loaded even when client Firestore is restricted
    getSystemConfig().then((apiCfg) => {
      if (apiCfg) {
        callback(apiCfg);
      }
    }).catch(() => {});

    const unsub = onSnapshot(doc(db, 'system_config', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() } as SystemConfig);
      } else {
        getSystemConfig().then((apiCfg) => {
          callback(apiCfg || defaults);
        }).catch(() => callback(defaults));
      }
    }, (err) => {
      console.warn('system_config snapshot notice (using server API fallback):', err?.message || err);
      getSystemConfig().then((apiCfg) => {
        callback(apiCfg || defaults);
      }).catch(() => callback(defaults));
    });

    return () => {
      unsub();
      trackerUnsub();
    };
  },


  updateSystemConfig: async (config: Partial<SystemConfig>): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-system-config', {
        method: 'POST',
        body: config
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'system_config/global');
      throw error;
    }
  },

};
