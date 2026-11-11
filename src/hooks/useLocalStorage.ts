import { useState, useEffect, useRef } from 'react';
import { getStorage } from '../utils/storage';

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  }, [defaultValue]);

  const [state, setState] = useState<T>(() => getStorage(key, defaultValue));
  const isFirstRender = useRef(true);

  // Sync state changes to localStorage without triggering mount loops
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    try {
      // PERF (DevTools runtime audit 2026-11-11): compute the persisted string
      // once and compare it with what is already stored. Same-value writes —
      // common when a parent re-render recreates object identity — must not
      // repeat synchronous localStorage I/O, and must not broadcast: every
      // mounted hook instance re-reads + re-parses storage on each broadcast.
      // Skipping the no-op write also skips the cascade entirely.
      let nextValue: string | null;
      if (state === null || state === undefined) {
        nextValue = null;
      } else if (typeof state === 'string') {
        nextValue = state;
      } else {
        nextValue = JSON.stringify(state);
      }

      const current = localStorage.getItem(key);
      if (nextValue === current) {
        return; // nothing changed — skip both the write and the broadcast
      }

      if (nextValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, nextValue);
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
