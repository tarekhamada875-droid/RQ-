import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Delegate } from '../../types';
import { DelegateDashboardView } from './DelegateDashboardView';

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() })
}));
vi.mock('../../hooks/useSystemConfig', () => ({ useSystemConfig: () => ({}) }));
vi.mock('../ui/FitText', () => ({ FitText: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('../modals/TermsAndConditionsModal', () => ({ TermsAndConditionsModal: () => null }));

afterEach(() => cleanup());

function renderDelegateDashboard(
  createGarageResult = true,
  dashboardState: {
    delegateDashboardLoading?: boolean;
    delegateDashboardError?: boolean;
    delegateListsError?: boolean;
    onRetryDelegateDashboard?: () => void;
    onLoadMoreDelegateGarages?: () => void;
    delegatePagination?: {
      createdGarages: { hasMore: boolean; nextCursor: string | null };
      referredGarages: { hasMore: boolean; nextCursor: string | null };
    };
  } = {}
) {
  const delegate = {
    id: 'delegate_1',
    name: 'Test Delegate',
    phone: '01000000000',
    pin: '12345678',
    role: 'delegate',
    createdAt: new Date(0),
  } as Delegate;
  const onCreateGarage = vi.fn(async (_event: React.FormEvent<HTMLFormElement>) => createGarageResult);

  render(
    <DelegateDashboardView
      delegate={delegate}
      allGarages={[]}
      onLogout={vi.fn()}
      onCreateGarage={onCreateGarage}
      isLoading={false}
      {...dashboardState}
    />
  );

  return { onCreateGarage };
}

describe('DelegateDashboardView garage application access', () => {
  it('shows loading state instead of an empty result while the dashboard loads', () => {
    renderDelegateDashboard(true, { delegateDashboardLoading: true });

    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تحميل جراجاتك');
    expect(screen.queryByText('لا توجد جراجات مطابقة للبحث')).not.toBeInTheDocument();
  });

  it('shows a retryable error when the initial dashboard load fails', () => {
    const onRetryDelegateDashboard = vi.fn();
    renderDelegateDashboard(true, {
      delegateDashboardError: true,
      onRetryDelegateDashboard
    });

    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحميل جراجاتك');
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onRetryDelegateDashboard).toHaveBeenCalledOnce();
    expect(screen.queryByText('لا توجد جراجات مطابقة للبحث')).not.toBeInTheDocument();
  });

  it('surfaces pagination errors while keeping the load-more action available', () => {
    renderDelegateDashboard(true, {
      delegateListsError: true,
      delegatePagination: {
        createdGarages: { hasMore: true, nextCursor: 'created-cursor' },
        referredGarages: { hasMore: false, nextCursor: null }
      },
      onLoadMoreDelegateGarages: vi.fn()
    });

    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحميل المزيد من الجراجات');
    expect(screen.getByRole('button', { name: 'عرض المزيد من الجراجات' })).toBeInTheDocument();
  });

  it('shows and opens the application form', () => {
    renderDelegateDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'افتح جراج جديد' }));

    expect(screen.getByRole('heading', { name: 'طلب إنشاء جراج جديد' })).toBeInTheDocument();
    expect(screen.getByText('سيتم إرسال الطلب إلى الإدارة للمراجعة، ولن يتم تفعيل الجراج إلا بعد الموافقة.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('جراج التوفيق')).toBeInTheDocument();
  });

  it('prevents native submit and preserves the request draft when creation returns false', async () => {
    const { onCreateGarage } = renderDelegateDashboard(false);
    fireEvent.click(screen.getByRole('button', { name: 'افتح جراج جديد' }));

    const nameInput = screen.getByPlaceholderText('جراج التوفيق');
    fireEvent.change(nameInput, { target: { value: 'Test garage request draft' } });
    const form = nameInput.closest('form');
    if (!form) throw new Error('Delegate garage request form was not rendered');
    fireEvent.submit(form);

    await waitFor(() => expect(onCreateGarage).toHaveBeenCalledTimes(1));
    expect(onCreateGarage.mock.calls[0][0].defaultPrevented).toBe(true);
    expect(screen.getByRole('heading', { name: 'طلب إنشاء جراج جديد' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('جراج التوفيق')).toHaveValue('Test garage request draft');
  });

  it('closes the request form after successful creation', async () => {
    const { onCreateGarage } = renderDelegateDashboard(true);
    fireEvent.click(screen.getByRole('button', { name: 'افتح جراج جديد' }));

    const nameInput = screen.getByPlaceholderText('جراج التوفيق');
    fireEvent.change(nameInput, { target: { value: 'Test garage request' } });
    const form = nameInput.closest('form');
    if (!form) throw new Error('Delegate garage request form was not rendered');
    fireEvent.submit(form);

    await waitFor(() => expect(onCreateGarage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'طلب إنشاء جراج جديد' })).not.toBeInTheDocument());
  });
});
