import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPackagesView } from './AdminPackagesView';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    addPackage: vi.fn(),
  },
}));

const props = {
  packages: [],
  setConfirmDialog: vi.fn(),
  setPackageValidationError: vi.fn(),
  t: (key: string) => key,
};

const openAndFillPackageForm = () => {
  fireEvent.click(screen.getByRole('button', { name: 'إضافة باقة جديدة' }));
  fireEvent.change(screen.getByPlaceholderText('مثال: الباقة الفضية'), { target: { value: 'Test plan' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreService.addPackage).mockResolvedValue(undefined);
});

describe('AdminPackagesView package creation', () => {
  it('creates a valid package through the service', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '600' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    await waitFor(() => expect(firestoreService.addPackage).toHaveBeenCalledTimes(1));
    expect(firestoreService.addPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test plan',
      price: 600,
      durationDays: 30,
    }));
  });

  it('shows a visible error instead of silently ignoring a zero price', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '0' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('يرجى إدخال اسم وسعر صالحين لخطة الاشتراك');
    expect(firestoreService.addPackage).not.toHaveBeenCalled();
  });

  it('shows a visible error when the server rejects a valid package', async () => {
    vi.mocked(firestoreService.addPackage).mockRejectedValueOnce(new Error('request failed'));
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '600' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر حفظ الخطة. تحقق من الاتصال وحاول مرة أخرى.');
  });
});
