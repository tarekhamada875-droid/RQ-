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
  it('keeps optional assumptions advanced and the monthly table collapsed by default', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    expect(screen.queryByRole('spinbutton', { name: 'عمولة المندوبين' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'رسوم الدفع والتحويل' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'مصاريف شهرية أخرى' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('إعدادات متقدمة'));
    expect(screen.getByRole('spinbutton', { name: 'عمولة المندوبين' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'رسوم الدفع والتحويل' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'مصاريف شهرية أخرى' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('3. الجدول الشهري'));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('preserves forecast totals when only presentation details are collapsed', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    expect(screen.getByText('76,800 ج.م')).toBeInTheDocument();
    expect(screen.getByText('60,000 ج.م')).toBeInTheDocument();
    expect(screen.getByText('16,800 ج.م')).toBeInTheDocument();

    fireEvent.click(screen.getByText('3. الجدول الشهري'));

    expect(screen.getByText('76,800 ج.م')).toBeInTheDocument();
    expect(screen.getByText('60,000 ج.م')).toBeInTheDocument();
    expect(screen.getByText('16,800 ج.م')).toBeInTheDocument();
  });

});
