import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPlansModal } from './AdminPlansModal';
import type { Package } from '../../types';

vi.mock('../../services', () => ({
  firestoreService: {
    addPackage: vi.fn(),
    deletePackage: vi.fn(),
  },
}));

const validBundle: Package = {
  id: 'credit-400',
  name: '400 credits',
  price: 400,
  creditQuantity: 400,
  catalogType: 'credit_bundle',
  isActive: true,
};

const legacyPackage = {
  id: 'legacy-month',
  name: 'Monthly legacy',
  price: 300,
  durationDays: 30,
  dailyCapacity: 50,
  isActive: true,
} as unknown as Package;

const mixedPackage = {
  id: 'mixed-package',
  name: 'Mixed package',
  price: 400,
  creditQuantity: 400,
  catalogType: 'credit_bundle',
  durationDays: 30,
  isActive: true,
} as unknown as Package;

describe('AdminPlansModal credit-bundle catalog', () => {
  it('lists only canonical credit bundles', () => {
    render(
      <AdminPlansModal
        isOpen
        onClose={vi.fn()}
        packages={[validBundle, legacyPackage, mixedPackage]}
        setConfirmDialog={vi.fn()}
        adminLang="en"
        t={(key) => key}
      />
    );

    expect(screen.getByText('400 credits')).toBeInTheDocument();
    expect(screen.getByText('400 رصيد دخول غير منتهٍ')).toBeInTheDocument();
    expect(screen.queryByText('Monthly legacy')).not.toBeInTheDocument();
    expect(screen.queryByText('Mixed package')).not.toBeInTheDocument();
    expect(screen.queryByText('سجل زمني قديم حتى الترحيل')).not.toBeInTheDocument();
  });
});
