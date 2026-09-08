const fs = require('fs');

let code = `
import { getAuth } from 'firebase/auth';

const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
};

export const vehicleService = {
  checkInVehicle: async (garageId, vehicleData) => {
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
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  
  checkOutVehicle: async (garageId, vehicleId, cost, staffName, staffId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/vehicles/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
        body: JSON.stringify({ garageId, vehicleId, staffName })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  
  deleteVehicleWithRefund: async (garageId, vehicleId, refundAmount, passedTodayYMD, staffName, staffId) => {
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
    } catch (err) {
      throw err;
    }
  }
};
`;

fs.writeFileSync('src/services/vehicleService.ts', code);
