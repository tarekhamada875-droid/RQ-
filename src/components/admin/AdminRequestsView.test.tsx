import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminRequestsView } from './AdminRequestsView';
import type { Garage } from '../../types';

const pendingGarage: Garage = {
  id: 'garage-1',
  name: 'جراج الاختبار',
  phone: '01000000000',
  hourlyRate: 20,
  overnightRate: 100,
  createdAt: new Date('2026-10-23T08:00:00Z'),
  createdByDelegateName: 'مندوب الاختبار',
  status: 'pending',
};

describe('AdminRequestsView Arabic-only interface', () => {
  it('shows an Arabic error when approving a garage request fails', async () => {
    const handleApproveGarage = vi.fn().mockRejectedValue(new Error('INTERNAL_SERVER_ERROR'));

    render(
      <AdminRequestsView
        pendingGarages={[pendingGarage]}
        handleApproveGarage={handleApproveGarage}
        handleRejectGarage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    screen.getByRole('button', { name: 'تأكيد وتفعيل الجراج' }).click();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'تعذر تفعيل الجراج. يرجى المحاولة مرة أخرى.',
    );
    expect(screen.queryByText('INTERNAL_SERVER_ERROR')).not.toBeInTheDocument();
  });

  it('keeps Arabic copy and RTL layout when a legacy English preference exists', () => {
    localStorage.setItem('admin_lang', 'en');

    render(
      <AdminRequestsView
        pendingGarages={[pendingGarage]}
        handleApproveGarage={vi.fn().mockResolvedValue(undefined)}
        handleRejectGarage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('طلبات تسجيل الجراجات')).toBeInTheDocument();
    expect(screen.getByText('تأكيد وتفعيل الجراج')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رفض' })).toBeInTheDocument();
    expect(screen.getByText('طلبات تسجيل الجراجات').closest('[dir]')).toHaveAttribute('dir', 'rtl');
    expect(screen.queryByText('Garage registration requests')).not.toBeInTheDocument();
  });
});
