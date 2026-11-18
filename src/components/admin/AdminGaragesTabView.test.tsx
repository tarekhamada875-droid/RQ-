import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminGaragesTabView } from './AdminGaragesTabView';

// Owner decision 2026-11-18: garages pinned to their own credit rate carry
// creditRateOverride and must be visibly marked in the admin garages list —
// amber "سعر مخصص" pill showing the 2-decimal EGP-per-credit price (never the
// raw stored inverse). Garages following the global price show no pill.

const garageBase: any = {
  id: 'g-1',
  name: 'جراح العبئة 11',
  isLocked: false,
  billingModel: 'prepaid_credits',
};

const renderList = (garages: any[]) =>
  render(
    <AdminGaragesTabView
      displayedGarages={garages}
      adminSearch=""
      setAdminSearch={vi.fn()}
      onSelectGarage={vi.fn()}
      onOpenAddGarage={vi.fn()}
    />,
  );

describe('AdminGaragesTabView custom-price badge', () => {
  it('marks garages with a rate override, showing the rounded price', () => {
    renderList([{ ...garageBase, creditRateOverride: 1 / 0.75 }]);
    expect(screen.getByText('سعر مخصص: 0.75')).toBeInTheDocument();
  });

  it('shows no badge for garages following the global price', () => {
    renderList([garageBase]);
    expect(screen.queryByText(/سعر مخصص/)).not.toBeInTheDocument();
  });

  it('treats an invalid override as absent rather than crashing', () => {
    renderList([{ ...garageBase, creditRateOverride: 0 }]);
    expect(screen.queryByText(/سعر مخصص/)).not.toBeInTheDocument();
  });
});
