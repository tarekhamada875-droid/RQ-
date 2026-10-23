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
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '12345678' } });
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
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '12345678' } });
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
    fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد إضافة المندوب' }));

    expect(await screen.findByText('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.')).toBeInTheDocument();
    expect(firestoreService.addDelegate).not.toHaveBeenCalled();
  });
});


describe('AdminPeopleView English localization', () => {
  it('uses English labels and left-to-right layout when English is selected', () => {
    themeMock.adminLang = 'en';

    render(
      <AdminPeopleView
        delegates={[]}
        currentSupervisor={null}
        allGarages={[]}
        onSelectDelegate={vi.fn()}
      />,
    );

    expect(screen.getByText('Delegates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Delegate' })).toBeInTheDocument();
    expect(screen.getByText('No delegates registered yet')).toBeInTheDocument();
    expect(screen.getByText('Delegates').closest('[dir]')).toHaveAttribute('dir', 'ltr');

    fireEvent.click(screen.getByRole('button', { name: 'Add Delegate' }));
    expect(screen.getByText('Add a new system delegate')).toBeInTheDocument();
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.getByText('Phone number')).toBeInTheDocument();
    expect(screen.getByText('Access PIN (exactly 8 digits)')).toBeInTheDocument();
  });
});
