import { auth, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { listenerTracker } from '../utils/listenerTracker';
import type { SystemConfig } from '../types';

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  adminColor: '#10b981'
};

const configListeners = new Set<(config: SystemConfig | null) => void>();

const getSystemConfig = async (): Promise<SystemConfig | null> => {
  // system_config is private; use local/default bootstrap until an active Worker session exists.
  if (!auth.currentUser) return null;

  try {
    const apiRes = await apiFetch<{ success?: boolean; config?: SystemConfig }>('/api/system-config');
    return apiRes?.success && apiRes.config ? apiRes.config : null;
  } catch (error) {
    console.error('Error fetching system config:', error);
    return null;
  }
};

export const adminSystemConfigService = {
  getSystemConfig,
  subscribeToSystemConfig: (callback: (config: SystemConfig | null) => void) => {
    const trackerUnsub = listenerTracker.register('system_config_worker_api');
    configListeners.add(callback);

    const refresh = () => {
      void getSystemConfig().then((apiConfig) => {
        if (configListeners.has(callback)) callback(apiConfig || DEFAULT_SYSTEM_CONFIG);
      });
    };

    // The app subscribes before the session coordinator has completed login.
    // Refresh after it claims the server-owned session so settings are not stuck at defaults.
    if (typeof window !== 'undefined') window.addEventListener('rq-session-ready', refresh);
    refresh();

    return () => {
      configListeners.delete(callback);
      if (typeof window !== 'undefined') window.removeEventListener('rq-session-ready', refresh);
      trackerUnsub();
    };
  },

  updateSystemConfig: async (config: Partial<SystemConfig>): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-system-config', {
        method: 'POST',
        body: config
      });
      const updatedConfig = await getSystemConfig();
      if (updatedConfig) {
        configListeners.forEach((listener) => listener(updatedConfig));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'system_config/global');
      throw error;
    }
  },
};
