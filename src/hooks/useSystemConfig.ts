import { useState, useEffect } from 'react';
import { adminService } from '../services';
import type { SystemConfig } from '../types';

let cachedConfig: SystemConfig | null = null;
const listeners = new Set<(config: SystemConfig | null) => void>();
let unsubSingleton: (() => void) | null = null;
let hasFetchedThisSession = false;

const CACHE_KEY = 'app_system_config';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function loadFromLocalStorage(): SystemConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.cachedAt) return null;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.config ?? null;
  } catch {
    return null;
  }
}

function saveToLocalStorage(config: SystemConfig | null) {
  try {
    if (config) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ config, cachedAt: Date.now() }));
    }
  } catch {
    // localStorage might be full or disabled (private mode). Silent fallback.
  }
}

function subscribeSingleton() {
  if (unsubSingleton) return;

  // Try localStorage cache first — if valid, use it immediately and skip
  // the API call. This saves 1 Worker request per app session for returning
  // users. The cache TTL is 1 hour, so admin changes propagate within an hour.
  const cached = loadFromLocalStorage();
  if (cached && !hasFetchedThisSession) {
    cachedConfig = cached;
    listeners.forEach((l) => l(cached));
  }

  unsubSingleton = adminService.subscribeToSystemConfig((c) => {
    cachedConfig = c;
    hasFetchedThisSession = true;
    saveToLocalStorage(c);
    listeners.forEach((l) => l(c));
  });
}

function unsubscribeSingletonIfEmpty() {
  if (listeners.size === 0 && unsubSingleton) {
    unsubSingleton();
    unsubSingleton = null;
    hasFetchedThisSession = false;
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
