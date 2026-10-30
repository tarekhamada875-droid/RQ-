import { create } from 'zustand';
import { Garage, Delegate } from '../types';

interface AppState {
  // Primary Store Data
  // setGarages/setDelegates removed — nothing subscribed to these arrays and
  // the mirror writes were pure overhead on every Firestore snapshot.
  // updateGarage is retained because AdminGarageDetailsView still calls it
  // after referral updates; it maps over an always-empty array (no-op).
  garages: Garage[];
  updateGarage: (garage: Garage) => void;
  delegates: Delegate[];
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
  updateGarage: (updatedGarage) => set((state) => ({
    garages: state.garages.map(g => g.id === updatedGarage.id ? updatedGarage : g),
  })),
  delegates: [],
  showToast: () => {},
}));
