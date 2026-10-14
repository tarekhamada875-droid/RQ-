import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPackagesView } from './AdminPackagesView';
import { firestoreService } from '../../services';
import { ApiError } from '../../api/apiClient';

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

  it('creates a seven-day package when the weekly duration is selected', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '120' } });
    const durationSelect = document.querySelector('select[name="pkgDurationDays"]');
    expect(durationSelect).not.toBeNull();
    fireEvent.change(durationSelect!, { target: { value: '7' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    await waitFor(() => expect(firestoreService.addPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test plan',
      price: 120,
      durationDays: 7,
    })));
  });

  it('shows seven-day plans when the weekly admin filter is selected', () => {
    render(<AdminPackagesView
      {...props}
      packages={[{
        id: 'weekly-test-plan',
        name: 'Weekly test plan',
        price: 120,
        durationDays: 7,
        dailyCapacity: 50,
        vehiclesCount: 7,
        isActive: true,
      }]}
    />);

    expect(screen.queryByText('Weekly test plan')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 يوم' }));
    expect(screen.getByText('Weekly test plan')).toBeInTheDocument();
  });

  it('shows a visible error instead of silently ignoring a zero price', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '0' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('يرجى إدخال اسم وسعر صالحين لخطة الاشتراك');
    expect(firestoreService.addPackage).not.toHaveBeenCalled();
  });

  it('reports a server error without blaming the internet connection', async () => {
    vi.mocked(firestoreService.addPackage).mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', {
      status: 500,
      correlationId: 'corr-plan-500',
    }));
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '600' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('حدث خطأ في الخادم أثناء حفظ الخطة.');
    expect(alert).toHaveTextContent('corr-plan-500');
    expect(alert).not.toHaveTextContent('اتصال');
  });

  it('shows the connection message only for an actual network error', async () => {
    vi.mocked(firestoreService.addPackage).mockRejectedValueOnce(new ApiError('NETWORK_ERROR', {
      code: 'NETWORK_ERROR',
    }));
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '600' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.');
  });
});
