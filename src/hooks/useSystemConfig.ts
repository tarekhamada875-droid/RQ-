import { useState, useEffect } from 'react';
import { firestoreService } from '../services';
import type { SystemConfig } from '../types';

let cachedConfig: SystemConfig | null = null;
const listeners = new Set<(config: SystemConfig | null) => void>();
let unsubSingleton: (() => void) | null = null;

function subscribeSingleton() {
  if (unsubSingleton) return;
  unsubSingleton = firestoreService.subscribeToSystemConfig((c) => {
    cachedConfig = c;
    listeners.forEach((l) => l(c));
  });
}

function unsubscribeSingletonIfEmpty() {
  if (listeners.size === 0 && unsubSingleton) {
    unsubSingleton();
    unsubSingleton = null;
  }
}

export const useSystemConfig = () => {
  const [config, setConfig] = useState<SystemConfig | null>(cachedConfig);

  useEffect(() => {
    subscribeSingleton();
    const handler = (c: SystemConfig | null) => setConfig(c);
    listeners.add(handler);
    if (cachedConfig !== null) {
      setConfig(cachedConfig);
    }

    return () => {
      listeners.delete(handler);
      unsubscribeSingletonIfEmpty();
    };
  }, []);

  return config;
};

