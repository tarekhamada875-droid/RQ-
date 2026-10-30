import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CheckOutModal } from './CheckOutModal';
import type { Garage, Vehicle } from '../../types';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('CheckOutModal confirmation guard', () => {
  it('releases the confirmation guard when the handler resolves without starting a request', async () => {
    const vehicle = {
      id: 'سجط1234',
      plateNumber: 'س ج ط 1 2 3 4',
      plateNumberRaw: 'سجط1234',
      entryTime: new Date('2026-10-30T17:00:00.000Z'),
      type: 'hourly',
      status: 'inside',
    } as Vehicle;
    const garage = { id: 'garage_modal_test', hourlyRate: 15, overnightRate: 40 } as Garage;
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <CheckOutModal
        selectedVehicle={vehicle}
        garage={garage}
        currentStaff={null}
        isLoading={false}
        loadingType={null}
        now={new Date('2026-10-30T18:00:00.000Z')}
        onConfirm={onConfirm}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيسر' }));
    const confirmButton = await screen.findByRole('button', {
      name: 'تأكيد خروج السيارة س ج ط 1 2 3 4',
    });

    fireEvent.click(confirmButton);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).not.toBeDisabled());

    fireEvent.click(confirmButton);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });
});
