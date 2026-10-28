import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPartnerDividendCard } from './AdminPartnerDividendCard';

describe('AdminPartnerDividendCard dynamic investment projections', () => {
  it('renders the three projection sections and derives results from editable inputs', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    expect(screen.getByRole('heading', { name: 'حجم النشاط والإيرادات' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'المصاريف وحصة المستثمرين' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. النتائج المتوقعة' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. الجدول الشهري' })).toBeInTheDocument();
    expect(screen.queryByText('حاسبة الاستثمار والتوقعات')).not.toBeInTheDocument();
    expect(screen.queryByText('ابدأ من هنا: بيانات الاستثمار')).not.toBeInTheDocument();
    expect(screen.queryByText(/الباقة الشهرية/)).not.toBeInTheDocument();
    expect(screen.queryByText(/حصة المؤسس 52/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'الأرصدة المدفوعة لكل جراج شهريًا' }), { target: { value: '100' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سعر الرصيد' }), { target: { value: '2' } });

    expect(screen.getAllByText('1,000 ج.م').length).toBeGreaterThan(0);
    expect(screen.getAllByText('38,400 ج.م').length).toBeGreaterThan(0);
  });

  it('allows a numeric field to be cleared before entering a replacement value', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);
    const price = screen.getByRole('spinbutton', { name: 'سعر الرصيد' });

    fireEvent.change(price, { target: { value: '' } });
    expect(price).toHaveValue(null);

    fireEvent.change(price, { target: { value: '2' } });
    expect(price).toHaveValue(2);
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

    const advancedSettings = screen.getByText('إعدادات متقدمة').closest('details');
    expect(advancedSettings).not.toHaveAttribute('open');
    expect(advancedSettings).toContainElement(screen.getByRole('spinbutton', { name: 'عمولة المندوبين' }));
    expect(advancedSettings).toContainElement(screen.getByRole('spinbutton', { name: 'رسوم الدفع والتحويل' }));
    expect(advancedSettings).toContainElement(screen.getByRole('spinbutton', { name: 'مصاريف شهرية أخرى' }));

    const monthlyForecast = screen.getByText('3. الجدول الشهري').closest('details');
    expect(monthlyForecast).not.toHaveAttribute('open');

    fireEvent.click(screen.getByText('إعدادات متقدمة'));
    expect(advancedSettings).toHaveAttribute('open');

    fireEvent.click(screen.getByText('3. الجدول الشهري'));
    expect(monthlyForecast).toHaveAttribute('open');
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
