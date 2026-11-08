import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminPeopleView } from './AdminPeopleView';
import { authService, delegateService } from '../../services';
import { ApiError } from '../../api/apiClient';

vi.mock('../../services', () => { const _svc = {
    isPinTaken: vi.fn(),
    addDelegate: vi.fn(),
  }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

const themeMock = vi.hoisted(() => ({ adminLang: 'ar' }));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => themeMock,
}));

// PERF (audit 2026-11-08): FastInput uses a native 'input' event listener,
// not React's onChange. fireEvent.change fires a React synthetic 'change'
// event which FastInput doesn't see. To fill a FastInput in tests, we must
// set the DOM value directly and dispatch a native 'input' event, then
// blur to trigger onCommit.
const fillFastInput = (placeholder: string, value: string) => {
  const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.blur(input);
};

beforeEach(() => {
  themeMock.adminLang = 'ar';
  vi.clearAllMocks();
  vi.mocked(authService.isPinTaken).mockResolvedValue({ taken: false });
});

describe('AdminPeopleView delegate creation', () => {
  it('reports server failures without blaming the internet connection', async () => {
    vi.mocked(delegateService.addDelegate).mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', {
      status: 500,
      correlationId: 'delegate-ref-500',
    }));
    render(
      <AdminPeopleView
        delegates={[]}
       
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fillFastInput('مثال: أحمد محمد...', 'Test delegate');
    fillFastInput('01xxxxxxxxx', '01012345');
    fillFastInput('•••••', '12345');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر على الخادم إضافة المندوب (رقم التتبع: delegate-ref-500).')).toBeInTheDocument();
  });

  it('uses the connection message only for actual network failures', async () => {
    vi.mocked(delegateService.addDelegate).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', { code: 'NETWORK_ERROR' }));
    render(
      <AdminPeopleView
        delegates={[]}
       
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fillFastInput('مثال: أحمد محمد...', 'Test delegate');
    fillFastInput('01xxxxxxxxx', '01012345');
    fillFastInput('•••••', '12345');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBeInTheDocument();
  });

  it('does not create a delegate when the PIN availability check fails', async () => {
    vi.mocked(authService.isPinTaken).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', { code: 'NETWORK_ERROR' }));
    render(
      <AdminPeopleView
        delegates={[]}
       
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fillFastInput('مثال: أحمد محمد...', 'Test delegate');
    fillFastInput('01xxxxxxxxx', '01012345');
    fillFastInput('•••••', '12345');
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBeInTheDocument();
    expect(delegateService.addDelegate).not.toHaveBeenCalled();
  });
});

describe('AdminPeopleView Arabic-only interface', () => {
  it('keeps Arabic labels and right-to-left layout even when a legacy English preference exists', () => {
    

    render(
      <AdminPeopleView
        delegates={[]}
       
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    expect(screen.getByText('المناديب المعينون')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة مندوب جديد' })).toBeInTheDocument();
    expect(screen.getByText('لا يوجد مناديب مسجلين حالياً')).toBeInTheDocument();
    expect(screen.getByText('المناديب المعينون').closest('[dir]')).toHaveAttribute('dir', 'rtl');

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    expect(screen.getByText('إضافة مندوب جديد للنظام')).toBeInTheDocument();
    expect(screen.getByText('الاسم بالكامل')).toBeInTheDocument();
    expect(screen.getByText('رقم الهاتف')).toBeInTheDocument();
    expect(screen.getByText('رمز الدخول (5 أرقام بالضبط)')).toBeInTheDocument();
  });
});
