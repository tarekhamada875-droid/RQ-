import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, where, onSnapshot, addDoc, setDoc, updateDoc, doc, getDoc, getDocs, deleteDoc, orderBy, limit, serverTimestamp, startAfter, Timestamp } from 'firebase/firestore';
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
import { withRetry, safeDate } from '../utils';
import { listenerTracker } from '../utils/listenerTracker';

export const adminService = {
  // Supervisors
  addSupervisor: async (data: Omit<Supervisor, 'id'>) => {
    try {
      return await withRetry(() => addDoc(collection(db, 'supervisors'), {
        ...data,
        createdAt: serverTimestamp()
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'supervisors');
      throw error;
    }
  },

  removeSupervisor: async (id: string) => {
    try {
      return await withRetry(() => deleteDoc(doc(db, 'supervisors', id)));
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
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'supervisors'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  updateSupervisor: async (id: string, data: Partial<Supervisor>) => {
    try {
      const payload: any = { ...data };
      if (data.pin) {
        payload.currentSessionId = null;
      }
      return await withRetry(() => updateDoc(doc(db, 'supervisors', id), payload));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `supervisors/${id}`);
      throw error;
    }
  },

  // Staff
  addStaff: async (data: Omit<Staff, 'id'>) => {
    try {
      return await withRetry(() => addDoc(collection(db, 'staff'), {
        ...data,
        createdAt: serverTimestamp()
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'staff');
      throw error;
    }
  },

  updateStaff: async (id: string, data: Partial<Staff>) => {
    try {
      const payload: any = { ...data };
      if (data.pin) {
        payload.currentSessionId = null;
      }
      return await withRetry(() => updateDoc(doc(db, 'staff', id), payload));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `staff/${id}`);
      throw error;
    }
  },

  removeStaff: async (id: string) => {
    try {
      return await withRetry(() => deleteDoc(doc(db, 'staff', id)));
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
      if (error.message === 'CURRENT_PIN_INCORRECT') {
        throw new Error('رمز الدخول الحالي غير صحيح');
      }
      throw error;
    }
  },

  subscribeToWalletNumber: (callback: (wallet: string) => void) => {
    return adminService.subscribeToSystemConfig((config) => {
      callback(config?.walletNumber || '01000000000');
    });
  },

  updateWalletNumber: async (walletNumber: string): Promise<void> => {
    try {
      await setDoc(doc(db, 'system_config', 'global'), {
        walletNumber,
        updatedAt: serverTimestamp()
      }, { merge: true });
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
    const pkgData: Record<string, any> = {
      name: pkg.name,
      price: pkg.price,
      vehiclesCount: pkg.vehiclesCount,
      durationDays: pkg.durationDays || 30,
      dailyCapacity: pkg.dailyCapacity !== undefined ? pkg.dailyCapacity : 50,
      isActive: true,
      createdAt: serverTimestamp()
    };
    if (pkg.discountType !== undefined) pkgData.discountType = pkg.discountType;
    if (pkg.discountValue !== undefined) pkgData.discountValue = pkg.discountValue;

    await withRetry(() => addDoc(collection(db, 'packages'), pkgData));
  },

  deletePackage: async (id: string): Promise<void> => {
    const docRef = doc(db, 'packages', id);
    await withRetry(() => setDoc(docRef, { isActive: false }, { merge: true }));
  },

  subscribeToPackages: (callback: (packages: Package[]) => void) => {
    const colRef = collection(db, 'packages');
    return onSnapshot(colRef, async (snapshot) => {
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
        localStorage.setItem('app_packages_cache', `${Date.now()}|${JSON.stringify(activePkgs)}`);
      } catch (e) {}
      callback(activePkgs);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'packages'));
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
      const subscribersCol = collection(db, `garages/${garageId}/subscribers`);
      const subscriberRef = doc(subscribersCol);
      await setDoc(subscriberRef, {
        ...subscriberData,
        id: subscriberRef.id,
        createdAt: serverTimestamp()
      });
      return subscriberRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `garages/${garageId}/subscribers`);
      throw error;
    }
  },

  renewSubscriber: async (garageId: string, subscriberId: string, _costUnits: number, newDates: { startDate: string, endDate: string }) => {
    try {
      const subscriberRef = doc(db, `garages/${garageId}/subscribers`, subscriberId);
      await updateDoc(subscriberRef, {
        startDate: newDates.startDate,
        endDate: newDates.endDate
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/subscribers/${subscriberId}/renew`);
      throw error;
    }
  },

  updateSubscriber: async (garageId: string, subscriberId: string, subscriberData: any) => {
    try {
      return await withRetry(() => updateDoc(doc(db, `garages/${garageId}/subscribers`, subscriberId), subscriberData));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/subscribers`);
      throw error;
    }
  },

  deleteSubscriber: async (garageId: string, subscriberId: string) => {
    try {
      return await withRetry(() => deleteDoc(doc(db, `garages/${garageId}/subscribers`, subscriberId)));
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
      return null;
    }
  },

  // Coupons
  addCoupon: async (coupon: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'>) => {
    try {
      return await withRetry(() => addDoc(collection(db, 'coupons'), {
        ...coupon,
        usedCount: 0,
        createdAt: serverTimestamp()
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'coupons');
      throw error;
    }
  },

  updateCoupon: async (id: string, data: Partial<Coupon>) => {
    try {
      return await withRetry(() => updateDoc(doc(db, 'coupons', id), data));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coupons/${id}`);
      throw error;
    }
  },

  deleteCoupon: async (id: string) => {
    try {
      return await withRetry(() => deleteDoc(doc(db, 'coupons', id)));
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
      const { id, timestamp, ...rest } = log;
      return await addDoc(collection(db, 'activity_logs'), {
        ...rest,
        timestamp: timestamp || serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'activity_logs');
      throw error;
    }
  },

  getActivityLogsSince: async (sinceDate: Date, maxCount = 2000): Promise<ActivityLog[]> => {
    try {
      const firestoreTimestamp = Timestamp.fromDate(sinceDate);
      const q = query(
        collection(db, 'activity_logs'),
        where('timestamp', '>=', firestoreTimestamp),
        orderBy('timestamp', 'desc'),
        limit(maxCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
    } catch (error) {
      console.warn('[adminService] getActivityLogsSince index fallback:', error);
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(maxCount)
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
      const q = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', 'recharge'),
        limit(limitCount)
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
      const docRef = await addDoc(collection(db, 'announcements'), {
        ...announcement,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'announcements');
      throw error;
    }
  },

  deleteAnnouncement: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `announcements/${id}`);
      throw error;
    }
  },

  toggleAnnouncementActive: async (id: string, isActive: boolean): Promise<void> => {
    try {
      await updateDoc(doc(db, 'announcements', id), { isActive });
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
      defaultTrialDays: 15, 
      warningDaysThreshold: 3, 
      supportPhone: '01000000000',
      walletNumber: '01000000000',
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
      const docSnap = await getDoc(doc(db, 'system_config', 'global'));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as SystemConfig;
      }
      return {
        defaultTrialDays: 15,
        warningDaysThreshold: 3,
        supportPhone: '01000000000',
        walletNumber: '01000000000',
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
      await setDoc(doc(db, 'system_config', 'global'), {
        ...config,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'system_config/global');
      throw error;
    }
  }
};
