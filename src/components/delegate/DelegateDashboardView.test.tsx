import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function renderDelegateDashboard(canCreateGarage?: boolean) {
  const delegate: Delegate = {
    id: 'delegate_1',
    name: 'Test Delegate',
    phone: '01000000000',
    pin: '12345678',
    role: 'delegate',
    createdAt: new Date(0),
    canCreateGarage
  };
  const onCreateGarage = vi.fn(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return true;
  });

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
});
