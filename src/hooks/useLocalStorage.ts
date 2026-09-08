import { useState, useEffect, useRef } from 'react';
import { getStorage } from '../utils';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  const [state, setState] = useState<T>(() => getStorage(key, defaultValueRef.current));
  const isFirstRender = useRef(true);

  // Sync state changes to localStorage without triggering mount loops
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      if (state === null || state === undefined) {
        localStorage.removeItem(key);
      } else if (typeof state === 'string') {
        localStorage.setItem(key, state);
      } else {
        localStorage.setItem(key, JSON.stringify(state));
      }
      window.dispatchEvent(new CustomEvent('local-storage-update', { detail: { key } }));
    } catch (e) {
      console.error('Error writing localStorage key', key, e);
    }
  }, [key, state]);

  // Listen for storage changes from other tabs or components for THIS key only
  useEffect(() => {
    const handleStorageChange = (e: Event) => {
      if (e instanceof CustomEvent && e.detail?.key && e.detail.key !== key) {
        return;
      }
      if (e instanceof StorageEvent && e.key && e.key !== key) {
        return;
      }
      const newValue = getStorage(key, defaultValueRef.current);
      setState(prev => {
        if (typeof newValue === 'object' && newValue !== null) {
          if (JSON.stringify(newValue) === JSON.stringify(prev)) return prev;
        } else if (newValue === prev) {
          return prev;
        }
        return newValue;
      });
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('local-storage-update', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('local-storage-update', handleStorageChange);
    };
  }, [key]);

  return [state, setState];
}

