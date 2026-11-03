import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { GarageDataProvider, useGarageData, type GarageDataContextValue } from './garageDataContext';

afterEach(() => cleanup());

const stubGarageData: GarageDataContextValue = {
  garage: null,
  setGarage: vi.fn(),
  delegate: null,
  setDelegate: vi.fn(),
  vehicles: [],
  todayTransactions: [],
  allGarages: [],
  setAllGarages: vi.fn(),
  delegates: [],
  setDelegates: vi.fn(),
  staffList: [],
  setStaffList: vi.fn(),
  delegatePagination: undefined,
  delegateListsLoading: false,
  delegateListsError: false,
  delegateDashboardLoading: false,
  delegateDashboardError: false,
  retryDelegateDashboard: vi.fn(),
  loadMoreDelegateGarages: vi.fn().mockResolvedValue(undefined),
  delegateGarages: [],
  adminGarageHasMore: false,
  adminDelegateHasMore: false,
  adminListsLoading: false,
  adminListsError: false,
  loadMoreAdminGarages: vi.fn().mockResolvedValue(undefined),
  loadMoreAdminDelegates: vi.fn().mockResolvedValue(undefined),
  refreshAdminLists: vi.fn().mockResolvedValue(undefined),
  loadGarageData: vi.fn().mockResolvedValue(undefined),
};

function Consumer() {
  const data = useGarageData();
  return <span data-testid="garage-count">{data.allGarages.length}</span>;
}

describe('GarageDataContext', () => {
  it('throws when useGarageData is called outside a GarageDataProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useGarageData())).toThrow(
      'useGarageData must be used within GarageDataProvider',
    );
    spy.mockRestore();
  });

  it('returns the provider value when called inside a GarageDataProvider', () => {
    render(
      <GarageDataProvider value={stubGarageData}>
        <Consumer />
      </GarageDataProvider>,
    );
    expect(screen.getByTestId('garage-count').textContent).toBe('0');
  });

  it('renders children inside the provider tree', () => {
    const children: ReactNode = <div data-testid="child">child</div>;
    render(<GarageDataProvider value={stubGarageData}>{children}</GarageDataProvider>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
