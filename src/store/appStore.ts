import { create } from 'zustand';
import { Garage, Delegate } from '../types';

interface AppState {
  // Primary Store Data
  garages: Garage[];
  setGarages: (garages: Garage[]) => void;
  updateGarage: (garage: Garage) => void;
  delegates: Delegate[];
  setDelegates: (delegates: Delegate[]) => void;
  /**
   * No-op retained for backward compatibility with callers in
   * AdminGarageDetailsView / AdminGarageSettingsSection. The actual toast UI
   * is driven by local state in useGarageApp; this store call writes to
   * nothing visible. Safe to remove once those callers are migrated.
   */
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const useAppStore = create<AppState>((set) => ({
  garages: [],
  setGarages: (garages) => set({ garages }),
  updateGarage: (updatedGarage) => set((state) => ({
    garages: state.garages.map(g => g.id === updatedGarage.id ? updatedGarage : g),
  })),
  delegates: [],
  setDelegates: (delegates) => set({ delegates }),
  showToast: () => {},
}));
