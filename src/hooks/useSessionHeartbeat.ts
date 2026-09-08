import { useEffect } from 'react';
import { updateSessionHeartbeat } from '../services/authSessionService';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const useSessionHeartbeat = (
  garageId: string | null | undefined,
  activeSessionId: string | null | undefined
) => {
  useEffect(() => {
    if (!garageId || !activeSessionId) return;

    // Send immediate heartbeat on mount
    updateSessionHeartbeat(garageId);

    const interval = setInterval(() => {
      updateSessionHeartbeat(garageId);
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [garageId, activeSessionId]);
};
