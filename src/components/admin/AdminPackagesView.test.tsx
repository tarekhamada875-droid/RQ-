import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPackagesView } from './AdminPackagesView';
import { firestoreService } from '../../services';
import { ApiError } from '../../api/apiClient';
import type { Package } from '../../types';
import { useAppStore } from '../../store/appStore';

vi.mock('../../services', () => ({
  firestoreService: {
    addPackage: vi.fn(),
    deletePackage: vi.fn(),
  },
}));

const props = {
  packages: [],
  setConfirmDialog: vi.fn(),
  t: (key: string) => key,
};

const openAndFillPackageForm = () => {
  fireEvent.click(screen.getByRole('button', { name: 'إضافة قالب أرصدة' }));
  fireEvent.change(screen.getByPlaceholderText('مثال: قالب 400 رصيد'), { target: { value: 'Test credits' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreService.addPackage).mockResolvedValue(undefined);
});

describe('AdminPackagesView credit-bundle catalog', () => {
  it('creates a valid one-to-one credit bundle through the service', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '400' } });
    fireEvent.change(screen.getByPlaceholderText('400'), { target: { value: '400' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    await waitFor(() => expect(firestoreService.addPackage).toHaveBeenCalledTimes(1));
    expect(firestoreService.addPackage).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Test credits',
      price: 400,
      creditQuantity: 400,
      catalogType: 'credit_bundle',
    }));
  });

  it('shows valid credit bundles and hides old or mixed-format records', () => {
    const legacyPackage = {
      id: 'legacy-30', name: 'Legacy month', price: 300, durationDays: 30, vehiclesCount: 30, dailyCapacity: 50, isActive: true,
    } as unknown as Package;
    const mixedPackage = {
      id: 'mixed-30', name: 'Mixed format', price: 400, creditQuantity: 400, catalogType: 'credit_bundle', durationDays: 30, isActive: true,
    } as unknown as Package;
    render(<AdminPackagesView
      {...props}
      packages={[
        { id: 'credit-400', name: '400 credits', price: 400, creditQuantity: 400, catalogType: 'credit_bundle', isActive: true },
        legacyPackage,
        mixedPackage,
      ]}
    />);

    expect(screen.getByText('400 credits')).toBeInTheDocument();
    expect(screen.getByText('400 رصيد دخول غير منتهٍ')).toBeInTheDocument();
    expect(screen.queryByText('Legacy month')).not.toBeInTheDocument();
    expect(screen.queryByText('Mixed format')).not.toBeInTheDocument();
  });

  it('rejects a duplicate quantity and price without calling the service', async () => {
    render(<AdminPackagesView
      {...props}
      packages={[{ id: 'credit-400', name: 'Existing', price: 400, creditQuantity: 400, catalogType: 'credit_bundle', isActive: true }]}
    />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '400' } });
    fireEvent.change(screen.getByPlaceholderText('400'), { target: { value: '400' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Existing');
    expect(firestoreService.addPackage).not.toHaveBeenCalled();
  });

  it('rejects a credit bundle whose EGP price differs from its credit count', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '600' } });
    fireEvent.change(screen.getByPlaceholderText('400'), { target: { value: '400' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('1 جنيه لكل رصيد');
    expect(firestoreService.addPackage).not.toHaveBeenCalled();
  });

  it('shows a visible error instead of silently ignoring invalid price or quantity', async () => {
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '0' } });
    fireEvent.change(screen.getByPlaceholderText('400'), { target: { value: '0' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('يرجى إدخال اسم وسعر وعدد أرصدة صالحين');
    expect(firestoreService.addPackage).not.toHaveBeenCalled();
  });

  it('reports a server error without blaming the internet connection', async () => {
    vi.mocked(firestoreService.addPackage).mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', { status: 500, correlationId: 'corr-plan-500' }));
    render(<AdminPackagesView {...props} />);
    openAndFillPackageForm();
    fireEvent.change(screen.getByPlaceholderText('800'), { target: { value: '400' } });
    fireEvent.change(screen.getByPlaceholderText('400'), { target: { value: '400' } });
    fireEvent.submit(screen.getByPlaceholderText('800').closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('حدث خطأ في الخادم أثناء حفظ قالب الأرصدة.');
    expect(alert).toHaveTextContent('corr-plan-500');
    expect(alert).not.toHaveTextContent('اتصال');
  });


  it('reports package deletion failures instead of silently closing the dialog', async () => {
    vi.mocked(firestoreService.deletePackage).mockRejectedValueOnce(new Error('temporary failure'));
    const showToast = vi.spyOn(useAppStore.getState(), 'showToast');
    render(<AdminPackagesView {...props} packages={[
      { id: 'credit-400', name: '400 credits', price: 400, creditQuantity: 400, catalogType: 'credit_bundle', isActive: true }
    ]} />);

    fireEvent.click(screen.getByTitle('حذف القالب'));
    const dialog = vi.mocked(props.setConfirmDialog).mock.calls.at(-1)?.[0] as any;
    expect(dialog).toEqual(expect.objectContaining({ isOpen: true }));
    await dialog.onConfirm();

    expect(firestoreService.deletePackage).toHaveBeenCalledWith('credit-400');
    expect(showToast).toHaveBeenCalledWith('تعذر حذف قالب الأرصدة. يرجى المحاولة مرة أخرى.', 'error');
    showToast.mockRestore();
  });

  it('associates every credit-bundle creation control with its visible label', () => {
    const { container } = render(<AdminPackagesView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'إضافة قالب أرصدة' }));

    const controls = [
      screen.getByRole('textbox', { name: /اسم قالب الأرصدة/ }),
      screen.getByRole('textbox', { name: /سعر القالب/ }),
      screen.getByRole('textbox', { name: /عدد أرصدة الدخول/ }),
    ];

    expect(container.querySelectorAll('label[for^="admin-package-"]')).toHaveLength(3);
    controls.forEach((control) => expect(control).toHaveAccessibleName());
  });
});
