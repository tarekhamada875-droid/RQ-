import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteGarageConfirmModal } from './DeleteGarageConfirmModal';
import { Garage } from '../../types';

const mockGarage: Garage = {
  id: 'garage-123',
  name: 'جراج النور',
  ownerName: 'محمد أحمد',
  phone: '01000000000',
  capacity: 50,
  carsInside: 10,
  hourlyRate: 10,
  overnightRate: 30,
  pin: '1234',
  balance: 100,
  createdAt: new Date(),
  updatedAt: new Date()
} as Garage;

describe('DeleteGarageConfirmModal', () => {
  it('renders server-reported progress accessibly without inventing a percentage while loading', () => {
    render(
      <DeleteGarageConfirmModal
        garage={mockGarage}
        isLoading={true}
        progress={{ phase: 'deleting', processed: 214, total: 340, percentage: 63 }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('214 سجل تم حذفه')).toBeInTheDocument();
    expect(screen.queryByText('63%')).not.toBeInTheDocument();
    expect(screen.queryByText('214 / 340')).not.toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuetext', '214 records processed');
    expect(progressBar).not.toHaveAttribute('aria-valuenow');

    expect(screen.queryByText('نعم، حذف الجراج')).not.toBeInTheDocument();
    expect(screen.queryByText('إلغاء')).not.toBeInTheDocument();
  });

  it('calls onConfirm once when clicking delete button before deletion starts', () => {
    const onConfirmMock = vi.fn();
    const onCancelMock = vi.fn();

    render(
      <DeleteGarageConfirmModal
        garage={mockGarage}
        isLoading={false}
        progress={null}
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />
    );

    const deleteBtn = screen.getByText('نعم، حذف الجراج');
    expect(deleteBtn).toBeInTheDocument();
    expect(screen.getByText('إلغاء')).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
    expect(onCancelMock).not.toHaveBeenCalled();
  });
});
