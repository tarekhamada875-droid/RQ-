import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckInModal } from './CheckInModal';
import { DeleteVehicleConfirmModal } from './DeleteVehicleConfirmModal';

const ModalStack = () => {
  const [showCheckIn, setShowCheckIn] = useState(true);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(true);

  return (
    <>
      {showCheckIn && (
        <CheckInModal
          newPlateNumber="TEST123"
          garage={{ id: 'garage-1', name: 'Test Garage', dailyCapacity: 50 } as any}
          isLoading={false}
          loadingType={null}
          onCheckIn={vi.fn()}
          onCancel={() => setShowCheckIn(false)}
        />
      )}
      {showDeleteConfirmation && (
        <DeleteVehicleConfirmModal
          vehicle={{ id: 'vehicle-1', plateNumber: 'TEST123' } as any}
          isLoading={false}
          onConfirm={vi.fn()}
          onCancel={() => setShowDeleteConfirmation(false)}
        />
      )}
      <button type="button" onClick={() => setShowDeleteConfirmation(false)}>Close delete confirmation</button>
      <button type="button" onClick={() => setShowCheckIn(false)}>Close check-in</button>
    </>
  );
};

beforeEach(() => {
  document.body.style.overflow = 'auto';
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
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('modal body scroll lock integration', () => {
  it('keeps scrolling disabled until both nested modal owners close', () => {
    const { unmount } = render(<ModalStack />);

    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close delete confirmation' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close check-in' }));
    expect(document.body.style.overflow).toBe('auto');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });
});
