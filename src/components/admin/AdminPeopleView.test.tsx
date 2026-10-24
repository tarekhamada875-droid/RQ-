import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminPeopleView } from './AdminPeopleView';
import { firestoreService } from '../../services';
import { ApiError } from '../../api/apiClient';

vi.mock('../../services', () => ({
  firestoreService: {
    isPinTaken: vi.fn(),
    addDelegate: vi.fn(),
  },
}));

const themeMock = vi.hoisted(() => ({ adminLang: 'ar' as 'ar' | 'en' }));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => themeMock,
}));

beforeEach(() => {
  themeMock.adminLang = 'ar';
  vi.clearAllMocks();
  vi.mocked(firestoreService.isPinTaken).mockResolvedValue({ taken: false });
});

describe('AdminPeopleView delegate creation', () => {
  it('reports server failures without blaming the internet connection', async () => {
    vi.mocked(firestoreService.addDelegate).mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', {
      status: 500,
      correlationId: 'delegate-ref-500',
    }));
    render(
      <AdminPeopleView
        delegates={[]}
        currentSupervisor={null}
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fireEvent.change(screen.getByPlaceholderText('مثال: أحمد محمد...'), { target: { value: 'Test delegate' } });
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345' } });
    fireEvent.change(screen.getByPlaceholderText('•••••'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر على الخادم إضافة المندوب (رقم التتبع: delegate-ref-500).')).toBeInTheDocument();
  });

  it('uses the connection message only for actual network failures', async () => {
    vi.mocked(firestoreService.addDelegate).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', { code: 'NETWORK_ERROR' }));
    render(
      <AdminPeopleView
        delegates={[]}
        currentSupervisor={null}
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fireEvent.change(screen.getByPlaceholderText('مثال: أحمد محمد...'), { target: { value: 'Test delegate' } });
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345' } });
    fireEvent.change(screen.getByPlaceholderText('•••••'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBeInTheDocument();
  });

  it('does not create a delegate when the PIN availability check fails', async () => {
    vi.mocked(firestoreService.isPinTaken).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', { code: 'NETWORK_ERROR' }));
    render(
      <AdminPeopleView
        delegates={[]}
        currentSupervisor={null}
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'إضافة مندوب جديد' }));
    fireEvent.change(screen.getByPlaceholderText('مثال: أحمد محمد...'), { target: { value: 'Test delegate' } });
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345' } });
    fireEvent.change(screen.getByPlaceholderText('•••••'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBeInTheDocument();
    expect(firestoreService.addDelegate).not.toHaveBeenCalled();
  });
});


describe('AdminPeopleView Arabic-only interface', () => {
  it('keeps Arabic labels and right-to-left layout even when a legacy English preference exists', () => {
    themeMock.adminLang = 'en';

    render(
      <AdminPeopleView
        delegates={[]}
        currentSupervisor={null}
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
