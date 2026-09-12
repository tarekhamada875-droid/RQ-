import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showOfflineScreen, setShowOfflineScreen] = useState(false);

  useEffect(() => {
    let timeoutId: any;

    const checkRealConnection = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsOnline(false);
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setShowOfflineScreen(true);
        }, 2000);
        return;
      }

      setIsOnline(true);
      setShowOfflineScreen(false);
    };

    // Run initial check gracefully after mount
    checkRealConnection();

    const handleOnline = () => {
      if (timeoutId) clearTimeout(timeoutId);
      setIsOnline(true);
      setShowOfflineScreen(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowOfflineScreen(true);
      }, 2000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Handle app visibility to prevent stale state crashes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkRealConnection();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { isOnline, showOfflineScreen };
}

