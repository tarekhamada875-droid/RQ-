import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminPeopleView } from './AdminPeopleView';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    isPinTaken: vi.fn(),
    addDelegate: vi.fn(),
  },
}));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ adminLang: 'ar' }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreService.isPinTaken).mockResolvedValue({ taken: false });
});

describe('AdminPeopleView delegate creation', () => {
  it('shows an error when the delegate service rejects the new account', async () => {
    vi.mocked(firestoreService.addDelegate).mockRejectedValueOnce(new Error('request failed'));
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

    expect(await screen.findByText('تعذر إضافة المندوب. تحقق من الاتصال وحاول مرة أخرى.')).toBeInTheDocument();
  });
});
