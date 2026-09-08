const fs = require('fs');
let code = fs.readFileSync('src/services/vehicleService.ts', 'utf8');

const reads = `
import { collection, query, where, onSnapshot, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../db/firebase';

function getCairoDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const originalCheckIn = vehicleService.checkInVehicle;

vehicleService.subscribeToActiveVehicles = (garageId, callback) => {
  const q = query(
    collection(db, \`garages/\${garageId}/vehicles\`),
    where('status', '==', 'inside')
  );
  return onSnapshot(q, (snapshot) => {
    const vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(vehicles);
  });
};

vehicleService.subscribeToTodayTransactions = (garageId, callback) => {
  const today = getCairoDateKey();
  const q = query(
    collection(db, 'activity_logs'),
    where('garageId', '==', garageId)
    // Removed timestamp filter as we need an index, client will filter
  );
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const todayLogs = logs.filter(log => {
       if (!log.timestamp) return false;
       const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
       return getCairoDateKey(d) === today;
    });
    // sort by timestamp descending
    todayLogs.sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
    callback(todayLogs);
  });
};

vehicleService.getVehiclesByPlateOnce = async (garageId, plateNumberRaw) => {
  const q = query(
    collection(db, \`garages/\${garageId}/vehicles\`),
    where('plateNumberRaw', '==', plateNumberRaw)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

vehicleService.getTodayTransactionsOnce = async (garageId) => {
  const today = getCairoDateKey();
  const q = query(
    collection(db, 'activity_logs'),
    where('garageId', '==', garageId)
  );
  const snapshot = await getDocs(q);
  const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return logs.filter(log => {
     if (!log.timestamp) return false;
     const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
     return getCairoDateKey(d) === today;
  }).sort((a, b) => {
    const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
    const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
    return tb - ta;
  });
};
`;

code = code.replace("export const vehicleService = {", reads + "\nexport const vehicleService: any = {");
fs.writeFileSync('src/services/vehicleService.ts', code);
