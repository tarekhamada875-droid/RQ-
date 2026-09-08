const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const vehiclesEndpoints = `
  // Secure Server API: Vehicle Check-In
  app.post('/api/vehicles/check-in', requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, plateNumber, plateRaw, type, isSubscriber, staffName } = req.body || {};
      const garageId = req.user?.role === 'garage' ? req.user.garageId : bodyGarageId;
      const staffId = req.user?.uid;
      
      if (!garageId || !plateNumber || !plateRaw) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      // Get Cairo date key helper inline
      const getCairoDateKey = () => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      };

      await adminDb.runTransaction(async (t: any) => {
        const garageRef = adminDb.doc(\`garages/\${garageId}\`);
        const vehicleRef = adminDb.doc(\`garages/\${garageId}/vehicles/\${plateRaw}\`);
        const today = getCairoDateKey();
        const dailyStatsRef = adminDb.doc(\`garages/\${garageId}/daily_stats/\${today}\`);

        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
        const garageData = garageSnap.data() || {};
        
        // Subscription check
        const expDateRaw = garageData.balanceExpiry;
        if (!expDateRaw) throw new Error('SUBSCRIPTION_EXPIRED');
        const expDate = expDateRaw.toDate ? expDateRaw.toDate() : new Date(expDateRaw);
        if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
           throw new Error('SUBSCRIPTION_EXPIRED');
        }

        // Capacity check
        const capacity = Number(garageData.dailyCapacity || 0);
        const used = Number(garageData.todayCount || 0);
        const isUnlimited = capacity === 0 || String(garageData.activePackageName || '').includes('مفتوح');
        if (!isUnlimited && used >= capacity) {
          throw new Error('CAPACITY_LIMIT_REACHED');
        }

        if (vehicleSnap.exists && vehicleSnap.data()?.status === 'inside') {
          throw new Error('VEHICLE_ALREADY_INSIDE');
        }

        const isNewDay = garageData.lastTransactionDate !== today;
        
        t.set(vehicleRef, {
          id: plateRaw,
          plate: plateNumber,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || 'hourly',
          isSubscriber: !!isSubscriber,
          entryTime: new Date(),
          status: 'inside',
          staffId: staffId || null,
          staffName: staffName || 'مدير الجراج'
        }, { merge: true });

        t.set(garageRef, {
          carsInside: (garageData.carsInside || 0) + 1,
          todayCount: isNewDay ? 1 : used + 1,
          todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
          lastTransactionDate: today
        }, { merge: true });

        if (!dailyStatsSnap.exists) {
          t.set(dailyStatsRef, {
            dateId: today,
            count: 1,
            limit: isUnlimited ? 0 : capacity,
            revenue: 0,
            createdAt: new Date()
          });
        } else {
          t.set(dailyStatsRef, { count: (dailyStatsSnap.data()?.count || 0) + 1 }, { merge: true });
        }

        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: staffId || null,
          staffName: staffName || 'مدير الجراج',
          actionType: 'check_in',
          plateNumber,
          timestamp: new Date(),
          amount: 0
        });
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Server] Check-in error:', err);
      return res.status(500).json({ success: false, error: err.message || 'CHECK_IN_FAILED' });
    }
  });

  // Secure Server API: Vehicle Check-Out
  app.post('/api/vehicles/check-out', requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, vehicleId, staffName } = req.body || {};
      const garageId = req.user?.role === 'garage' ? req.user.garageId : bodyGarageId;
      const staffId = req.user?.uid;
      
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      let finalCost = 0;

      await adminDb.runTransaction(async (t: any) => {
        const garageRef = adminDb.doc(\`garages/\${garageId}\`);
        const vehicleRef = adminDb.doc(\`garages/\${garageId}/vehicles/\${vehicleId}\`);
        const today = getCairoDateKey();
        const dailyStatsRef = adminDb.doc(\`garages/\${garageId}/daily_stats/\${today}\`);

        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
        if (!vehicleSnap.exists) throw new Error('VEHICLE_NOT_FOUND');

        const garageData = garageSnap.data() || {};
        const vehicleData = vehicleSnap.data() || {};

        if (vehicleData.status === 'outside') {
          throw new Error('VEHICLE_ALREADY_OUTSIDE');
        }

        // Server-authoritative cost calculation
        let cost = 0;
        if (!vehicleData.isSubscriber) {
          const entryTime = vehicleData.entryTime?.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
          if (entryTime && !isNaN(entryTime.getTime())) {
            const diffMs = Date.now() - entryTime.getTime();
            let hours = Math.ceil(diffMs / (1000 * 60 * 60));
            if (hours < 1) hours = 1;
            const rate = Number(garageData.hourlyRate || 0);
            cost = hours * rate;
          }
        }
        finalCost = cost;

        t.set(vehicleRef, {
          status: 'outside',
          exitTime: new Date(),
          totalCost: cost
        }, { merge: true });

        const isNewDay = garageData.lastTransactionDate !== today;
        
        t.set(garageRef, {
          totalRevenue: (garageData.totalRevenue || 0) + cost,
          totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
          todayRevenue: isNewDay ? cost : (garageData.todayRevenue || 0) + cost,
          todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
          lastTransactionDate: today,
          carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
        }, { merge: true });

        if (!dailyStatsSnap.exists) {
          t.set(dailyStatsRef, {
            dateId: today,
            count: 0,
            revenue: cost,
            createdAt: new Date()
          });
        } else {
          t.set(dailyStatsRef, { revenue: (dailyStatsSnap.data()?.revenue || 0) + cost }, { merge: true });
        }

        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: staffId || null,
          staffName: staffName || 'مدير الجراج',
          actionType: 'check_out',
          plateNumber: vehicleData.plateNumber,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          entryTime: vehicleData.entryTime,
          type: vehicleData.type || 'hourly',
          isSubscriber: !!vehicleData.isSubscriber,
          timestamp: new Date(),
          amount: cost
        });
      });

      return res.json({ success: true, data: { cost: finalCost } });
    } catch (err: any) {
      console.error('[Server] Check-out error:', err);
      return res.status(500).json({ success: false, error: err.message || 'CHECK_OUT_FAILED' });
    }
  });

  // Secure Server API: Vehicle Delete
  app.post('/api/vehicles/delete', requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, vehicleId, refundAmount, staffName } = req.body || {};
      const garageId = req.user?.role === 'garage' ? req.user.garageId : bodyGarageId;
      const staffId = req.user?.uid;
      
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      await adminDb.runTransaction(async (t: any) => {
        const todayYMD = getCairoDateKey();
        const garageRef = adminDb.doc(\`garages/\${garageId}\`);
        const vehicleRef = adminDb.doc(\`garages/\${garageId}/vehicles/\${vehicleId}\`);
        const dailyStatsRef = adminDb.doc(\`garages/\${garageId}/daily_stats/\${todayYMD}\`);

        const [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageDoc.exists || !vehicleDoc.exists) throw new Error('NOT_FOUND');
        
        const garageData = garageDoc.data() || {};
        const vehicleData = vehicleDoc.data() || {};
        
        // Deletion limit logic
        const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
        if (todayDeletions >= 3) {
          throw new Error('reached_daily_deletion_limit');
        }

        const isSameRefundDay = garageData.lastRefundDate === todayYMD;
        const refundAmt = Math.max(0, Number(refundAmount || 0));

        let enteredToday = false;
        if (vehicleData.status === 'inside' && vehicleData.entryTime) {
          const entryTime = vehicleData.entryTime.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
          if (!isNaN(entryTime.getTime())) {
            const entryDateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(entryTime);
            enteredToday = entryDateKey === todayYMD;
          }
        }

        t.delete(vehicleRef);

        const updates: any = {
          isLocked: false,
          dailyDeletionCount: todayDeletions + 1,
          lastDeletionDate: todayYMD,
          dailyRefundCount: isSameRefundDay ? ((garageData.dailyRefundCount || 0) + 1) : 1,
          lastRefundDate: todayYMD
        };

        if (refundAmt > 0) updates.balance = (garageData.balance || 0) + refundAmt;
        if (vehicleData.status === 'inside') updates.carsInside = Math.max(0, (garageData.carsInside || 0) - 1);
        if (enteredToday) updates.todayCount = Math.max(0, (garageData.todayCount || 0) - 1);

        t.set(garageRef, updates, { merge: true });

        if (enteredToday && dailyStatsDoc.exists) {
          const prevCount = dailyStatsDoc.data()?.count || 0;
          if (prevCount > 0) t.set(dailyStatsRef, { count: prevCount - 1 }, { merge: true });
        }

        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: staffId || vehicleData.staffId || null,
          staffName: staffName || vehicleData.staffName || 'مدير الجراج',
          actionType: 'delete_refund',
          plateNumber: \`مسح لوحة: \${vehicleData.plateNumber || vehicleId}\`,
          timestamp: new Date(),
          amount: refundAmt
        });
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Server] Delete error:', err);
      return res.status(500).json({ success: false, error: err.message || 'DELETE_FAILED' });
    }
  });
`;

code = code.replace(
  "// Vite development middleware vs Static Production serving",
  vehiclesEndpoints + "\n  // Vite development middleware vs Static Production serving"
);

fs.writeFileSync('server.ts', code);
