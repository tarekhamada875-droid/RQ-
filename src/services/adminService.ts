import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy, limit, startAfter, Timestamp } from 'firebase/firestore';
import type { 
  Supervisor, 
  Staff, 
  Package, 
  Coupon, 
  Announcement, 
  SystemConfig, 
  ActivityLog, 
  Subscriber 
} from '../types';
import { safeDate } from '../utils';
import { listenerTracker } from '../utils/listenerTracker';

export const adminService = {
  // Supervisors
  addSupervisor: async (data: Omit<Supervisor, 'id'>) => {
    try {
      const res = await apiFetch('/api/supervisors/create', {
        method: 'POST',
        body: data
      });
      return { id: res.id };
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      throw error;
    }
  },

  removeSupervisor: async (id: string) => {
    try {
      await apiFetch('/api/supervisors/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `supervisors/${id}`);
      throw error;
    }
  },

  subscribeToSupervisors: (callback: (supervisors: Supervisor[]) => void) => {
    const trackerUnsub = listenerTracker.register('supervisors');
    const q = query(collection(db, 'supervisors'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supervisor));
      callback(list);
    }, (err) => {
      console.warn('[adminService] subscribeToSupervisors listener error:', err);
      callback([]);
    });

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  updateSupervisor: async (id: string, data: Partial<Supervisor>) => {
    try {
      if (data.pin) {
        await apiFetch('/api/people/update-pin', {
          method: 'POST',
          body: { entityType: 'supervisors', entityId: id, newPin: data.pin }
        });
      }
      const { pin, ...otherFields } = data;
      if (Object.keys(otherFields).length > 0) {
        await apiFetch('/api/supervisors/update', {
          method: 'POST',
          body: { id, ...otherFields }
        });
      }
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      handleFirestoreError(error, OperationType.UPDATE, `supervisors/${id}`);
      throw error;
    }
  },

  // Staff
  addStaff: async (data: Omit<Staff, 'id'>) => {
    try {
      const res = await apiFetch('/api/staff/create', {
        method: 'POST',
        body: data
      });
      return { id: res.id };
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      throw error;
    }
  },

  updateStaff: async (id: string, data: Partial<Staff>) => {
    try {
      if (data.pin) {
        await apiFetch('/api/people/update-pin', {
          method: 'POST',
          body: { entityType: 'staff', entityId: id, newPin: data.pin }
        });
      }
      const { pin, ...otherFields } = data;
      if (Object.keys(otherFields).length > 0) {
        await apiFetch('/api/staff/update', {
          method: 'POST',
          body: { id, ...otherFields }
        });
      }
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      handleFirestoreError(error, OperationType.UPDATE, `staff/${id}`);
      throw error;
    }
  },

  removeStaff: async (id: string) => {
    try {
      await apiFetch('/api/staff/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff/${id}`);
      throw error;
    }
  },

  getStaffByGarageOnce: async (garageId: string): Promise<Staff[]> => {
    try {
      const q = query(collection(db, 'staff'), where('garageId', '==', garageId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff));
    } catch (e) {
      console.warn('Error in getStaffByGarageOnce:', e);
      return [];
    }
  },

  subscribeToGarageStaff: (garageId: string, callback: (staff: Staff[]) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/staff`);
    const q = query(
      collection(db, 'staff'),
      where('garageId', '==', garageId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'staff'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  subscribeToAdminPin: (callback: (pin: string) => void) => {
    return onSnapshot(doc(db, 'admin_settings', 'auth_pin'), (snapshot) => {
      callback(snapshot.data()?.pin || '');
    }, (err) => {
      console.warn('Admin pin subscription notice:', err);
      callback('');
    });
  },

  updateAdminPin: async (newPin: string, currentPin?: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-pin', {
        method: 'POST',
        body: { newPin, currentPin }
      });
    } catch (error: any) {
      console.error('[AdminService] updateAdminPin error:', error);
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      if (error.message === 'CURRENT_PIN_REQUIRED') {
        throw new Error('رمز الدخول الحالي مطلوب');
      }
      if (error.message === 'CURRENT_PIN_INCORRECT') {
        throw new Error('رمز الدخول الحالي غير صحيح');
      }
      throw error;
    }
  },

  subscribeToWalletNumber: (callback: (wallet: string) => void) => {
    return adminService.subscribeToSystemConfig((config) => {
      callback(config?.walletNumber || '');
    });
  },

  updateWalletNumber: async (walletNumber: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-system-config', {
        method: 'POST',
        body: { walletNumber }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'system_config/global');
      throw error;
    }
  },

  subscribeToSubscriptionPrices: (callback: (prices: any) => void) => {
    return adminService.subscribeToSystemConfig((config) => {
      callback(config?.subscriptionPrices || {});
    });
  },

  // Packages Management
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
    const colRef = collection(db, 'packages');
    return onSnapshot(colRef, async (snapshot) => {
      if (snapshot.empty) {
        try {
          localStorage.setItem('app_packages_cache', JSON.stringify([]));
        } catch (e) {}
        callback([]);
        return;
      }
      
      const activePkgs = snapshot.docs
        .map(doc => {
          const data = doc.data() as Package;
          return {
            id: doc.id,
            ...data,
            durationDays: data.durationDays || data.vehiclesCount || 30,
            dailyCapacity: data.dailyCapacity !== undefined ? data.dailyCapacity : 50
          };
        })
        .filter(p => p.isActive !== false);
      
      try {
        localStorage.setItem('app_packages_cache', JSON.stringify(activePkgs));
      } catch (e) {}
      
      callback(activePkgs);
    }, (err) => {
      console.warn('[AdminService] Error listening to packages collection, falling back to cache:', err);
      try {
        const cached = localStorage.getItem('app_packages_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            callback(parsed);
            return;
          }
        }
      } catch (cacheErr) {}
      callback([]);
    });
  },

  // Subscribers
  subscribeToSubscribers: (garageId: string, callback: (subscribers: any[]) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/subscribers`);
    const q = query(
      collection(db, `garages/${garageId}/subscribers`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `garages/${garageId}/subscribers`));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  addSubscriber: async (garageId: string, subscriberData: any) => {
    try {
      const res = await apiFetch('/api/subscribers/add', {
        method: 'POST',
        body: { garageId, subscriberData }
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
        body: { garageId, subscriberId, newDates }
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
        body: { garageId, subscriberId, subscriberData }
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
        body: { garageId, subscriberId }
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

  // Coupons
  addCoupon: async (coupon: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'>) => {
    try {
      const res = await apiFetch('/api/admin/coupons/create', {
        method: 'POST',
        body: coupon
      });
      return res.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'coupons');
      throw error;
    }
  },

  updateCoupon: async (id: string, data: Partial<Coupon>) => {
    try {
      await apiFetch('/api/admin/coupons/update', {
        method: 'POST',
        body: { id, ...data }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coupons/${id}`);
      throw error;
    }
  },

  deleteCoupon: async (id: string) => {
    try {
      await apiFetch('/api/admin/coupons/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coupons/${id}`);
      throw error;
    }
  },

  subscribeToCoupons: (callback: (coupons: Coupon[]) => void) => {
    const trackerUnsub = listenerTracker.register('coupons');
    const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'coupons'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  // Activity Logs
  addActivityLog: async (log: Record<string, any>) => {
    try {
      const res = await apiFetch('/api/activity-logs/add', {
        method: 'POST',
        body: log
      });
      return res.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activity_logs');
      throw error;
    }
  },

  getActivityLogsSince: async (sinceDate: Date, maxCount = 2000): Promise<ActivityLog[]> => {
    const boundedMaxCount = Math.min(Math.max(Math.floor(maxCount) || 1, 1), 5000);
    try {
      const firestoreTimestamp = Timestamp.fromDate(sinceDate);
      const q = query(
        collection(db, 'activity_logs'),
        where('timestamp', '>=', firestoreTimestamp),
        orderBy('timestamp', 'desc'),
        limit(boundedMaxCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
    } catch (error) {
      console.warn('[adminService] getActivityLogsSince index fallback:', error);
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(boundedMaxCount)
      );
      const snap = await getDocs(fallbackQ);
      const sinceMs = sinceDate.getTime();
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      return logs.filter(log => safeDate(log.timestamp).getTime() >= sinceMs);
    }
  },

  getPaginatedActivityLogs: async (pageSize = 20, lastDocRef?: any) => {
    try {
      let q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(pageSize));
      if (lastDocRef) {
        q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), startAfter(lastDocRef), limit(pageSize));
      }
      const snap = await getDocs(q);
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      return { 
        logs, 
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'activity_logs');
      throw error;
    }
  },

  subscribeToGarageRechargeLogs: (garageId: string, callback: (logs: ActivityLog[]) => void, limitCount = 50, onError?: (err: any) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/recharge_logs`);
    try {
      const fetchLimit = Math.max(limitCount, 25);
      const q = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', 'recharge'),
        limit(fetchLimit)
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        data.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
        callback(data.slice(0, limitCount));
      }, (err) => {
        console.warn('Targeted recharge query fallback needed:', err);
        const fallbackQ = query(
          collection(db, 'activity_logs'),
          where('garageId', '==', garageId),
          limit(100)
        );
        const fallbackUnsub = onSnapshot(fallbackQ, (snapshot) => {
          const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog))
            .filter(log => log.actionType === 'recharge' || (log.plateNumber && (log.plateNumber.includes('شحن') || log.plateNumber.includes('تفعيل'))));
          data.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
          callback(data.slice(0, limitCount));
        }, (fallbackErr) => {
          handleFirestoreError(fallbackErr, OperationType.LIST, 'activity_logs');
          if (onError) onError(fallbackErr);
          else callback([]);
        });
        return () => {
          fallbackUnsub();
        };
      });

      return () => {
        unsub();
        trackerUnsub();
      };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'activity_logs');
      if (onError) onError(err);
      else callback([]);
      trackerUnsub();
      return () => {};
    }
  },

  adminDirectRechargeGarage: async (
    garageId: string,
    pkg: Package,
    adminDetails: { staffId?: string; staffName?: string; isEnglish?: boolean } = {}
  ): Promise<void> => {
    try {
      await apiFetch('/api/transactions/recharge-garage', {
        method: 'POST',
        body: {
          garageId,
          packageId: pkg.id,
          pkg,
          adminDetails
        }
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}`);
      throw error;
    }
  },

  adminExtendFairUse: async (
    garageId: string,
    extraCars?: number
  ): Promise<any> => {
    try {
      const res = await apiFetch(`/api/admin/garages/${garageId}/extend-fair-use`, {
        method: 'POST',
        body: { extraCars: extraCars || 0 }
      });
      return res;
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}`);
      throw error;
    }
  },

  getSystemLogsByPlateOnce: async (rawPlate: string): Promise<ActivityLog[]> => {
    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('plateNumber', '==', rawPlate),
        limit(50)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      }
      return [];
    } catch (err) {
      console.error('Error fetching activity logs by plate:', err);
      return [];
    }
  },

  // Announcements
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
  subscribeToSystemConfig: (callback: (config: SystemConfig | null) => void) => {
    const trackerUnsub = listenerTracker.register('system_config');
    const defaults: SystemConfig = { 
      defaultTrialDays: 2, 
      warningDaysThreshold: 3, 
      supportPhone: '01000000000',
      walletNumber: '',
      monthlySubscribersFlatFee: 500,
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

    const unsub = onSnapshot(doc(db, 'system_config', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() } as SystemConfig);
      } else {
        callback(defaults);
      }
    }, (err) => {
      console.warn('system_config snapshot notice (using defaults):', err?.message || err);
      callback(defaults);
    });

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  getSystemConfig: async (): Promise<SystemConfig | null> => {
    try {
      // 1. Try server API first for instantaneous cached response
      try {
        const apiRes = await apiFetch('/api/system-config');
        if (apiRes?.success && apiRes?.config) {
          return apiRes.config as SystemConfig;
        }
      } catch (apiErr) {
        // Fallback to direct Firestore getDoc
      }

      const docSnap = await getDoc(doc(db, 'system_config', 'global'));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as SystemConfig;
      }
      return {
        defaultTrialDays: 2,
        warningDaysThreshold: 3,
        supportPhone: '01000000000',
        walletNumber: '',
        monthlySubscribersFlatFee: 500,
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
    } catch (error) {
      console.error('Error fetching system config:', error);
      return null;
    }
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
  }
};
