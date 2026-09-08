import { create } from 'zustand';
import { Garage, Delegate, Package, RechargeRequest, Supervisor } from '../types';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: any;
  read?: boolean;
}

interface AppState {
  // Primary Store Data
  garages: Garage[];
  setGarages: (garages: Garage[]) => void;
  updateGarage: (garage: Garage) => void;
  packages: Package[];
  setPackages: (packages: Package[]) => void;
  delegates: Delegate[];
  setDelegates: (delegates: Delegate[]) => void;
  notifications: AppNotification[];
  addNotification: (notification: AppNotification) => void;
  clearNotification: (id: string) => void;
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  removeToast: (id: string) => void;

  // Backwards Compatible & Additional State
  allGarages: Garage[];
  setAllGarages: (garages: Garage[]) => void;
  user: any;
  setUser: (user: any) => void;
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  view: string;
  setView: (view: string) => void;
  role: 'admin' | 'delegate' | 'garage' | null;
  setRole: (role: any) => void;
  rechargeRequests: RechargeRequest[];
  setRechargeRequests: (requests: RechargeRequest[]) => void;
  supervisors: Supervisor[];
  setSupervisors: (supervisors: Supervisor[]) => void;

  // Selected Items
  selectedGarageForDetails: Garage | null;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  selectedDelegateForDetails: Delegate | null;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  toast: { message: string; type: string } | null;
  setToast: (toast: { message: string; type: string } | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  garages: [],
  setGarages: (garages) => set({ garages, allGarages: garages }),
  updateGarage: (updatedGarage) => set((state) => {
    const newGarages = state.garages.map(g => g.id === updatedGarage.id ? updatedGarage : g);
    return { garages: newGarages, allGarages: newGarages };
  }),
  packages: [],
  setPackages: (packages) => set({ packages }),
  delegates: [],
  setDelegates: (delegates) => set({ delegates }),
  notifications: [],
  addNotification: (notification) => set((state) => ({ notifications: [notification, ...state.notifications] })),
  clearNotification: (id) => set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) })),
  toasts: [],
  showToast: (message, type = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { id, message, type };
    set((state) => ({ toasts: [...state.toasts, newToast], toast: { message, type } }));
    setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  allGarages: [],
  setAllGarages: (allGarages) => set({ allGarages, garages: allGarages }),
  user: null,
  setUser: (user) => set({ user }),
  isAuthenticated: false,
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  view: 'login',
  setView: (view) => set({ view }),
  role: null,
  setRole: (role) => set({ role }),
  rechargeRequests: [],
  setRechargeRequests: (rechargeRequests) => set({ rechargeRequests }),
  supervisors: [],
  setSupervisors: (supervisors) => set({ supervisors }),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: (selectedGarageForDetails) => set({ selectedGarageForDetails }),
  selectedDelegateForDetails: null,
  setSelectedDelegateForDetails: (selectedDelegateForDetails) => set({ selectedDelegateForDetails }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  toast: null,
  setToast: (toast) => set({ toast }),
}));
