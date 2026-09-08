const fs = require('fs');

const code = `
import { getAuth } from 'firebase/auth';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Vehicle } from '../types';

const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
};

function getCairoDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export const vehicleService = {
  checkInVehicle: async (garageId: string, vehicleData: any) => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/vehicles/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({
          garageId,
          plateNumber: vehicleData.plateNumber,
          plateRaw: vehicleData.plateNumberRaw || vehicleData.id,
          type: vehicleData.type,
          isSubscriber: vehicleData.isSubscriber,
          staffName: vehicleData.staffName
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
  
  checkOutVehicle: async (garageId: string, vehicleId: string, _cost: number, staffName?: string, _staffId?: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/vehicles/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({ garageId, vehicleId, staffName })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return { success: true, cost: data.data?.cost };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
  
  deleteVehicleWithRefund: async (garageId: string, vehicleId: string, refundAmount: number, _passedTodayYMD?: string, staffName?: string, _staffId?: string) => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/vehicles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({ garageId, vehicleId, refundAmount, staffName })
      });
      const data = await res.json();
      if (!data.success) {
        if (data.error === 'reached_daily_deletion_limit') throw new Error('reached_daily_deletion_limit');
        throw new Error(data.error);
      }
      return true;
    } catch (err: any) {
      throw err;
    }
  },

  subscribeToActiveVehicles: (garageId: string, callback: (vehicles: Vehicle[]) => void) => {
    const q = query(
      collection(db, \`garages/\${garageId}/vehicles\`),
      where('status', '==', 'inside')
    );
    return onSnapshot(q, (snapshot) => {
      const vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
      callback(vehicles);
    });
  },

  subscribeToTodayTransactions: (garageId: string, callback: (logs: any[]) => void) => {
    const today = getCairoDateKey();
    const q = query(
      collection(db, 'activity_logs'),
      where('garageId', '==', garageId)
    );
    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const todayLogs = logs.filter(log => {
         if (!log.timestamp) return false;
         const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
         return getCairoDateKey(d) === today;
      });
      todayLogs.sort((a, b) => {
        const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return tb - ta;
      });
      callback(todayLogs);
    });
  },

  getVehiclesByPlateOnce: async (garageId: string, plateNumberRaw: string): Promise<Vehicle[]> => {
    const q = query(
      collection(db, \`garages/\${garageId}/vehicles\`),
      where('plateNumberRaw', '==', plateNumberRaw)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
  },

  getTodayTransactionsOnce: async (garageId: string): Promise<any[]> => {
    const today = getCairoDateKey();
    const q = query(
      collection(db, 'activity_logs'),
      where('garageId', '==', garageId)
    );
    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    return logs.filter(log => {
       if (!log.timestamp) return false;
       const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
       return getCairoDateKey(d) === today;
    }).sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
  }
};
`;

fs.writeFileSync('src/services/vehicleService.ts', code);
