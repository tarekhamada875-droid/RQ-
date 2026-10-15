import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminAddGarageModal } from './AdminAddGarageModal';

const makeProps = () => ({
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
});

describe('AdminAddGarageModal accessible names', () => {
  it('associates all six visible add-garage fields with their labels', () => {
    const { container } = render(<AdminAddGarageModal {...makeProps()} />);

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

  it('names every button and keeps close and safe-PIN generation callbacks intact', () => {
    const props = makeProps();
    render(<AdminAddGarageModal {...props} />);

    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(props.onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'توليد رقم سري عشوائي' }));
    expect(props.setPinInput).toHaveBeenCalledWith(expect.stringMatching(/^\d{8}$/));
  });
});
