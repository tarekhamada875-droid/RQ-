/**
 * Local-storage and snapshot-throttle helpers.
 */

export const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    if (typeof defaultValue === 'string') return saved as unknown as T;
    if (typeof defaultValue === 'boolean') return (saved === 'true') as unknown as T;
    return JSON.parse(saved);
  } catch {
    return defaultValue;
  }
};

/**
 * Throttles snapshot updates to prevent excessive re-renders and UI thrashing.
 */
export function throttleSnapshot<T>(callback: (data: T) => void, limitMs = 4000) {
  let lastRan = 0;
  let storedData: T | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = (incomingData: T) => {
    storedData = incomingData;
    const now = Date.now();

    if (now - lastRan >= limitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callback(storedData);
      lastRan = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        if (storedData !== null) {
          callback(storedData);
        }
        lastRan = Date.now();
        timeoutId = null;
      }, limitMs - (now - lastRan));
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    storedData = null;
  };

  return throttled;
}
