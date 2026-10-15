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

function renderDelegateDashboard(canCreateGarage?: boolean, createGarageResult = true) {
  const delegate: Delegate = {
    id: 'delegate_1',
    name: 'Test Delegate',
    phone: '01000000000',
    pin: '12345678',
    role: 'delegate',
    createdAt: new Date(0),
    canCreateGarage
  };
  const onCreateGarage = vi.fn(async (_event: React.FormEvent<HTMLFormElement>) => createGarageResult);

  render(
    <DelegateDashboardView
      delegate={delegate}
      allGarages={[]}
      onLogout={vi.fn()}
      onRecharge={vi.fn(async () => undefined)}
      onCreateGarage={onCreateGarage}
      isLoading={false}
      packages={[]}
      pendingRequests={[]}
      showToast={vi.fn()}
    />
  );

  return { onCreateGarage };
}

describe('DelegateDashboardView garage application access', () => {
  it.each([undefined, false, true])('shows and opens the application form when legacy canCreateGarage is %s', (legacyPermission) => {
    renderDelegateDashboard(legacyPermission);
    fireEvent.click(screen.getByRole('button', { name: 'طلب إنشاء جراج' }));

    expect(screen.getByRole('heading', { name: 'طلب إنشاء جراج جديد' })).toBeInTheDocument();
    expect(screen.getByText('سيتم إرسال الطلب إلى الإدارة للمراجعة، ولن يتم تفعيل الجراج إلا بعد الموافقة.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('جراج التوفيق')).toBeInTheDocument();
  });

  it('prevents native submit and preserves the request draft when creation returns false', async () => {
    const { onCreateGarage } = renderDelegateDashboard(undefined, false);
    fireEvent.click(screen.getByRole('button', { name: 'طلب إنشاء جراج' }));

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
    const { onCreateGarage } = renderDelegateDashboard(undefined, true);
    fireEvent.click(screen.getByRole('button', { name: 'طلب إنشاء جراج' }));

    const nameInput = screen.getByPlaceholderText('جراج التوفيق');
    fireEvent.change(nameInput, { target: { value: 'Test garage request' } });
    const form = nameInput.closest('form');
    if (!form) throw new Error('Delegate garage request form was not rendered');
    fireEvent.submit(form);

    await waitFor(() => expect(onCreateGarage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'طلب إنشاء جراج جديد' })).not.toBeInTheDocument());
  });
});
