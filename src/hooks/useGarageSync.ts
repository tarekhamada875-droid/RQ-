import { useState, useEffect, useMemo, useCallback } from 'react';
import { Garage, Vehicle, Package, Staff, RechargeRequest, Supervisor } from '../types';
import { firestoreService } from '../services';
import { DEFAULT_PACKAGES } from '../constants/packages';
import { throttleSnapshot } from '../utils';

interface UseGarageSyncProps {
  isSessionReady: boolean;
  isAuthReady: boolean;
  user: any;
  view: string;
  garage: Garage | null;
  setGarage: (g: Garage | null) => void;
  delegate: any | null;
  setDelegate: (d: any | null) => void;
  selectedGarageForDetails: Garage | null;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  setTodayTransactions: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  garageRef: React.MutableRefObject<Garage | null>;
  lastHealTimeRef: React.MutableRefObject<{ cars?: number; revenue?: number }>;
}

export function useGarageSync({
  isSessionReady,
  isAuthReady,
  user,
  view,
  garage,
  setGarage,
  delegate,
  setDelegate,
  selectedGarageForDetails,
  setSelectedGarageForDetails,
  setVehicles,
  setTodayTransactions,
  garageRef,
  lastHealTimeRef,
}: UseGarageSyncProps) {
  const [allGarages, setAllGarages] = useState<Garage[]>([]);
  const [delegates, setDelegates] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [delegateRequests, setDelegateRequests] = useState<RechargeRequest[]>([]);
  const [packages, setPackages] = useState<Package[]>(() => {
    try {
      const cached = localStorage.getItem('app_packages_cache');
      if (cached) {
        const parts = cached.split('|');
        if (parts.length > 1 && (Date.now() - parseInt(parts[0])) < 300000) {
          const parsed = JSON.parse(cached.substring(cached.indexOf('|') + 1));
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (e) {}
    return DEFAULT_PACKAGES;
  });

  // Subscribe to Active Vehicles
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    const throttledVehicleUpdate = throttleSnapshot((activeVehicles: Vehicle[]) => {
      setVehicles(activeVehicles);
      const currentGarage = garageRef.current;
      const now = Date.now();
      const isOnline = typeof navigator === 'undefined' || navigator.onLine;
      if (
        isOnline &&
        view === 'garage' &&
        currentGarage &&
        typeof currentGarage.carsInside === 'number' &&
        activeVehicles.length < 200 &&
        currentGarage.carsInside !== activeVehicles.length &&
        (!lastHealTimeRef.current.cars || now - lastHealTimeRef.current.cars > 30000)
      ) {
        lastHealTimeRef.current.cars = now;
        firestoreService.updateGarage(currentGarage.id, { carsInside: activeVehicles.length }).catch((err) => {
          console.warn('Failed to heal carsInside:', err);
        });
      }
    }, 1500);

    const unsub = firestoreService.subscribeToActiveVehicles(garage.id, (activeVehicles) => {
      throttledVehicleUpdate(activeVehicles);
    });
    return () => unsub();
  }, [isSessionReady, garage?.id, view, setVehicles, garageRef, lastHealTimeRef]);

  // Subscribe to completed transactions
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    const unsub = firestoreService.subscribeToTodayTransactions(garage.id, (completedTransactions) => {
      setTodayTransactions(completedTransactions);
    });
    return () => unsub();
  }, [isSessionReady, garage?.id, setTodayTransactions]);

  const loadGarageData = useCallback(async (garageId: string) => {
    try {
      const staff = await firestoreService.getStaffByGarageOnce(garageId);
      setStaffList(staff);
    } catch (err) {
      console.error('Failed to load garage data:', err);
    }
  }, [setStaffList]);

  // Sync Recharge Requests (Admin Only)
  useEffect(() => {
    if (!isAuthReady || !user) return;
    if (view !== 'admin_dashboard' && view !== 'admin_garage_details') return;

    const unsub = firestoreService.subscribeToPendingRechargeRequests((requests) => {
      setRechargeRequests(requests);
    });
    return () => unsub();
  }, [isAuthReady, user, view]);

  // Sync delegate requests
  useEffect(() => {
    if (!isAuthReady || !user || !delegate || view !== 'delegate_dashboard') return;

    const unsub = firestoreService.subscribeToDelegateRechargeRequests(delegate.id, (requests) => {
      setDelegateRequests(requests);
    });
    return () => unsub();
  }, [isAuthReady, user, delegate, view]);

  // Sync packages independently (prevents redundant re-subscribing on view changes)
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubPackages = firestoreService.subscribeToPackages((pkgs) => {
      if (Array.isArray(pkgs) && pkgs.length > 0) {
        setPackages(pkgs);
      } else {
        setPackages(DEFAULT_PACKAGES);
      }
    });

    return () => unsubPackages();
  }, [isAuthReady, user]);

  // Sync global collections
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !user || (view !== 'admin_dashboard' && view !== 'admin_garage_details' && view !== 'admin_delegate_details' && view !== 'garage' && view !== 'delegate_dashboard')) return;

    const unsubGarages = (view === 'delegate_dashboard' && delegate?.id)
      ? firestoreService.subscribeToDelegateGarages(delegate.id, setAllGarages)
      : (view === 'admin_dashboard' || view === 'admin_garage_details') 
      ? firestoreService.subscribeToGarages(setAllGarages)
      : () => {};
    
    const unsubDelegates = (view === 'admin_dashboard' || view === 'admin_delegate_details')
      ? firestoreService.subscribeToDelegates(setDelegates)
      : () => {};

    const unsubSupervisors = (view === 'admin_dashboard')
      ? firestoreService.subscribeToSupervisors(setSupervisors)
      : () => {};

    const unsubCurrentGarage = (view === 'garage' && garage?.id)
      ? firestoreService.subscribeToGarage(garage.id, setGarage)
      : () => {};

    const unsubCurrentDelegate = (view === 'delegate_dashboard' && delegate?.id)
      ? firestoreService.subscribeToDelegate(delegate.id, setDelegate)
      : () => {};
    
    return () => {
      unsubGarages();
      unsubDelegates();
      unsubSupervisors();
      unsubCurrentGarage();
      unsubCurrentDelegate();
    };
  }, [isSessionReady, isAuthReady, user, view, delegate?.id, garage?.id, setGarage, setDelegate]);

  // Load Admin specific garage details once
  useEffect(() => {
    if (!isAuthReady || !user || view !== 'admin_garage_details' || !selectedGarageForDetails?.id) return;

    const garageId = selectedGarageForDetails.id;
    const fetchSpecificData = async () => {
      try {
        const [staffData, garageData] = await Promise.all([
          firestoreService.getStaffByGarageOnce(garageId),
          firestoreService.getGarageById(garageId)
        ]);
        setStaffList(staffData);
        if (garageData) setSelectedGarageForDetails(garageData);
      } catch (err) {
        console.error('Admin garage details fetch error:', err);
      }
    };

    fetchSpecificData();
  }, [isAuthReady, user, view, selectedGarageForDetails?.id, setSelectedGarageForDetails]);

  const delegateGarages = useMemo(() => {
    if (!delegate) return [];
    return allGarages.filter(g => g.createdByDelegateId === delegate.id);
  }, [allGarages, delegate]);

  const sortedPackages = useMemo(() => {
    const activePkgs = packages || [];
    return [...activePkgs].sort((a, b) => a.price - b.price);
  }, [packages]);

  return {
    allGarages,
    setAllGarages,
    delegates,
    setDelegates,
    supervisors,
    setSupervisors,
    staffList,
    setStaffList,
    rechargeRequests,
    delegateRequests,
    packages,
    setPackages,
    loadGarageData,
    delegateGarages,
    sortedPackages,
  };
}
