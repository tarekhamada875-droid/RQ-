import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminRequestsView } from './AdminRequestsView';
import type { Garage } from '../../types';

vi.mock('../../services/adminBillingService', () => ({
  adminBillingService: {
    listPendingCreditRequests: vi.fn().mockResolvedValue([]),
    approveCreditRequest: vi.fn().mockResolvedValue(undefined),
    rejectCreditRequest: vi.fn().mockResolvedValue(undefined),
  },
}));

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

describe('AdminRequestsView unified queue', () => {
  it('merges garage and credit requests into one queue, newest first', async () => {
    const { adminBillingService } = await import('../../services/adminBillingService');
    vi.mocked(adminBillingService.listPendingCreditRequests).mockResolvedValueOnce([
      {
        id: 'credit-1',
        garageId: 'g2',
        garageName: 'جراج الرصيد',
        delegateId: 'd1',
        delegateName: 'مندوب الرصيد',
        amount: 500,
        status: 'pending',
        // Newer than the garage request (2026-10-23T08:00:00Z)
        createdAt: new Date('2026-10-24T08:00:00Z').getTime(),
        reviewedAt: null,
      },
    ] as any);

    const { container } = render(
      <AdminRequestsView
        pendingGarages={[pendingGarage]}
        handleApproveGarage={vi.fn().mockResolvedValue(undefined)}
        handleRejectGarage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // Both cards render with their own approve promise.
    expect(await screen.findByText('موافقة وإضافة الرصيد')).toBeInTheDocument();
    expect(screen.getByText('تأكيد وتفعيل الجراج')).toBeInTheDocument();

    // Newest (credit request) appears before the older garage request.
    const creditCard = screen.getByText('جراج الرصيد').closest('h3')!.parentElement!;
    const garageCard = screen.getByText('جراج الاختبار').closest('h3')!.parentElement!;
    expect(
      garageCard.compareDocumentPosition(creditCard) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    // One queue, one header — no per-section empty states.
    expect(screen.queryByText('لا توجد طلبات معلقة')).not.toBeInTheDocument();
    expect(container.textContent).toContain('طلبات الرصيد');
  });

  it('shows a single empty state when nothing is pending', async () => {
    render(
      <AdminRequestsView
        pendingGarages={[]}
        handleApproveGarage={vi.fn().mockResolvedValue(undefined)}
        handleRejectGarage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText('لا توجد طلبات معلقة')).toBeInTheDocument();
    // The old duplicated empty states are gone.
    expect(screen.queryByText('لا توجد طلبات تسجيل معلقة')).not.toBeInTheDocument();
    expect(screen.queryByText('لا توجد طلبات رصيد معلقة')).not.toBeInTheDocument();
  });
});
