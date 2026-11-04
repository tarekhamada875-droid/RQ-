import { createContext, useContext, type ReactNode } from 'react';
import type { useVehicleOperations } from './useVehicleOperations';

type VehicleOps = ReturnType<typeof useVehicleOperations>;

const VehicleOpsContext = createContext<VehicleOps | null>(null);

export function VehicleOpsProvider({ value, children }: { value: VehicleOps; children: ReactNode }) {
  return (
    <VehicleOpsContext.Provider value={value}>
      {children}
    </VehicleOpsContext.Provider>
  );
}

export function useVehicleOps(): VehicleOps {
  const ctx = useContext(VehicleOpsContext);
  if (!ctx) throw new Error('useVehicleOps must be used within VehicleOpsProvider');
  return ctx;
}
