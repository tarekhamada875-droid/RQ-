import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPartnerDividendCard } from './AdminPartnerDividendCard';

describe('AdminPartnerDividendCard dynamic investment projections', () => {
  it('renders the redesigned structure with headline run-rate, inputs, and visible table', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Header
    expect(screen.getByRole('heading', { name: 'حاسبة الاستثمار' })).toBeInTheDocument();

    // Zone 1: current run-rate headline
    expect(screen.getByText('إيرادك الحالي الشهري')).toBeInTheDocument();
    // 5 garages × 2000 credits × 1 EGP = 10,000 (appears in headline + month-1 table row)
    expect(screen.getAllByText('10,000 ج.م').length).toBeGreaterThan(0);

    // Zone 2: inputs section
    expect(screen.getByRole('heading', { name: 'الافتراضات' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'سيارات/يوم لكل جراج' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'أيام عمل/شهر' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'سعر الفحص' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'عمولة المندوب (لكل جراج جديد)' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'التكاليف الثابتة الشهرية' })).toBeInTheDocument();

    // Old field names are gone
    expect(screen.queryByRole('spinbutton', { name: 'الأرصدة المدفوعة لكل جراج شهريًا' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'عمولة المندوبين' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'رسوم الدفع والتحويل' })).not.toBeInTheDocument();

    // Auto-calculated credits chip (multiple elements match /2,000 رصيد/, so check the chip specifically)
    expect(screen.getAllByText(/2,000 رصيد/).length).toBeGreaterThan(0);

    // Zone 3: results — two big profit cards
    expect(screen.getByText('صافي الربح (12 شهرًا)')).toBeInTheDocument();
    expect(screen.getByText('متوسط الربح شهريًا')).toBeInTheDocument();

    // Table is visible by default (not behind a <details> toggle)
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('الشهر')).toBeInTheDocument();
    expect(screen.getByText('صافي الربح')).toBeInTheDocument();
  });

  it('updates the run-rate headline when cars/day changes', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Default: 5 × 100 × 20 × 1 = 10,000
    expect(screen.getAllByText('10,000 ج.م').length).toBeGreaterThan(0);

    // Change cars/day to 150: 5 × 150 × 20 × 1 = 15,000
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سيارات/يوم لكل جراج' }), { target: { value: '150' } });

    // 15,000 should now appear (headline + possibly table)
    expect(screen.getAllByText('15,000 ج.م').length).toBeGreaterThan(0);
  });

  it('allows a numeric field to be cleared before entering a replacement value', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);
    const price = screen.getByRole('spinbutton', { name: 'سعر الفحص' });

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

  it('keeps investor settings collapsed by default and hides investor breakdown when ownership is 0', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Investor settings are in a collapsed <details>
    const investorSettings = screen.getByText('إعدادات المستثمرين').closest('details');
    expect(investorSettings).not.toHaveAttribute('open');
    expect(investorSettings).toContainElement(screen.getByRole('spinbutton', { name: 'نسبة ملكية المستثمرين' }));
    expect(investorSettings).toContainElement(screen.getByRole('spinbutton', { name: 'عدد المستثمرين' }));

    // Investor breakdown is hidden when ownership = 0
    expect(screen.queryByText('إجمالي حصة المستثمرين')).not.toBeInTheDocument();
    expect(screen.queryByText('متوسط لكل مستثمر شهريًا')).not.toBeInTheDocument();

    // Open investor settings and set ownership > 0
    fireEvent.click(screen.getByText('إعدادات المستثمرين'));
    expect(investorSettings).toHaveAttribute('open');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'نسبة ملكية المستثمرين' }), { target: { value: '25' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد المستثمرين' }), { target: { value: '1' } });

    // Investor breakdown now appears
    expect(screen.getByText('إجمالي حصة المستثمرين')).toBeInTheDocument();
    expect(screen.getByText('متوسط لكل مستثمر شهريًا')).toBeInTheDocument();
  });

  it('shows the acquisition-cost info text explaining trial + referral discounts', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);
    expect(screen.getByText(/100 رصيد تجريبي/)).toBeInTheDocument();
    expect(screen.getByText(/20 رصيد إحالة/)).toBeInTheDocument();
  });
});
