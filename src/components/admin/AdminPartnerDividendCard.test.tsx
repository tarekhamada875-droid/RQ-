import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPartnerDividendCard } from './AdminPartnerDividendCard';

describe('AdminPartnerDividendCard dynamic investment projections', () => {
  it('renders the three projection sections and derives results from editable inputs', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    expect(screen.getByRole('heading', { name: '1. الافتراضات' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. النتائج المتوقعة' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. الجدول الشهري' })).toBeInTheDocument();
    expect(screen.getByText('حاسبة الاستثمار والتوقعات')).toBeInTheDocument();
    expect(screen.queryByText(/الباقة الشهرية/)).not.toBeInTheDocument();
    expect(screen.queryByText(/حصة المؤسس 52/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'الأرصدة المدفوعة لكل جراج شهريًا' }), { target: { value: '100' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سعر الرصيد' }), { target: { value: '2' } });

    expect(screen.getAllByText('1,000 ج.م').length).toBeGreaterThan(0);
    expect(screen.getAllByText('38,400 ج.م').length).toBeGreaterThan(0);
  });

  it('resets edited assumptions to the current garage defaults', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={7} />);
    const garages = screen.getByRole('spinbutton', { name: 'الجراجات الحالية' });

    fireEvent.change(garages, { target: { value: '20' } });
    expect(garages).toHaveValue(20);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة القيم الافتراضية' }));
    expect(garages).toHaveValue(7);
  });
});
