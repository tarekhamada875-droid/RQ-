import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineScreen, setShowOfflineScreen] = useState(!navigator.onLine);

  useEffect(() => {
    let timeoutId: any;
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
      }, 1200);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Handle app visibility to prevent stale state crashes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!navigator.onLine) {
          setIsOnline(false);
          setShowOfflineScreen(true);
        } else {
          if (timeoutId) clearTimeout(timeoutId);
          setIsOnline(true);
          setShowOfflineScreen(false);
        }
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

