import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { GarageSessionDoc } from '../services/authSessionService';

export const useSessionGuard = (
  garageId: string | null | undefined,
  currentSessionId: string | null | undefined,
  onForceLogout: (reason: string) => void
) => {
  useEffect(() => {
    if (!garageId || !currentSessionId) return;

    const sessionRef = doc(db, 'garage_sessions', garageId);

    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        onForceLogout('تم إنهاء الجلسة أو تم تسجيل الخروج من الجهاز.');
        return;
      }

      const data = snapshot.data() as GarageSessionDoc;

      if (data?.activeSessionId && data.activeSessionId !== currentSessionId) {
        onForceLogout('تم تسجيل الدخول إلى هذا الحساب من جهاز آخر.');
      }
    }, (error) => {
      console.warn('Session guard listener warning:', error);
    });

    return () => unsubscribe();
  }, [garageId, currentSessionId, onForceLogout]);
};
