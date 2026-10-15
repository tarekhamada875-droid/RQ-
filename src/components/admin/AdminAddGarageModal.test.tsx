import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminAddGarageModal } from './AdminAddGarageModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  garageForm: {
    name: '',
    hourlyRate: '',
    overnightRate: '',
    phone: '',
    isTrial: false,
    ownerPin: '',
  },
  setGarageForm: vi.fn(),
  pinInput: '',
  setPinInput: vi.fn(),
  allGarages: [],
  isLoading: false,
  onSubmit: vi.fn().mockResolvedValue(true),
  t: (key: string) => key,
};

describe('AdminAddGarageModal accessible names', () => {
  it('associates all six visible add-garage fields with their labels', () => {
    const { container } = render(<AdminAddGarageModal {...defaultProps} />);

    const controls = [
      screen.getByRole('textbox', { name: 'اسم الجراج' }),
      screen.getByRole('textbox', { name: 'سعر الساعة' }),
      screen.getByRole('textbox', { name: 'سعر المبيت' }),
      screen.getByRole('textbox', { name: 'رقم الموبايل (اختياري)' }),
      screen.getByRole('textbox', { name: 'رمز الدخول' }),
      screen.getByRole('combobox', { name: 'الجراج المُرشِّح / تمت الإحالة بواسطة (اختياري)' }),
    ];

    expect(container.querySelectorAll('label[for^="admin-add-garage-"]')).toHaveLength(6);
    controls.forEach((control) => expect(control).toHaveAccessibleName());
    expect(screen.getByRole('switch', { name: /تفعيل فترة تجريبية مجانية/ })).toBeInTheDocument();
  });
});
