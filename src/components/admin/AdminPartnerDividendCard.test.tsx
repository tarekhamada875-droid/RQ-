import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminPartnerDividendCard } from './AdminPartnerDividendCard';

describe('AdminPartnerDividendCard pitch-style investment projections', () => {
  it('renders the hero headline, assumptions strip, and trajectory chart (no table)', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Header
    expect(screen.getByRole('heading', { name: 'حاسبة الاستثمار' })).toBeInTheDocument();

    // Zone 1: HERO — headline number for 12-month net profit
    expect(screen.getByText('صافي الربح خلال 12 شهرًا')).toBeInTheDocument();
    // 5 garages × 2000 credits × 1 EGP = 10,000/mo gross, 12mo projection
    // hero shows total net profit; avg monthly + end-of-period garages also shown
    expect(screen.getByText(/متوسط شهريًا/)).toBeInTheDocument();
    expect(screen.getByText(/جراجات نهاية الفترة/)).toBeInTheDocument();

    // Zone 2: assumptions strip
    expect(screen.getByRole('heading', { name: 'الافتراضات' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'سيارات/يوم لكل جراج' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'أيام عمل/شهر' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'سعر الفحص' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'عمولة المندوب (لكل جراج جديد)' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'التكاليف الثابتة الشهرية' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'الجراجات الحالية' })).toBeInTheDocument();

    // Old field names are gone
    expect(screen.queryByRole('spinbutton', { name: 'الأرصدة المدفوعة لكل جراج شهريًا' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'عمولة المندوبين' })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'رسوم الدفع والتحويل' })).not.toBeInTheDocument();

    // Zone 3: trajectory chart replaces the table
    expect(screen.getByRole('img', { name: 'منحنى صافي الربح الشهري' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'منحنى صافي الربح الشهري' })).toBeInTheDocument();

    // The table is gone
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('الشهر')).not.toBeInTheDocument();

    // Zone 4: how-it's-calculated disclosure exists (collapsed by default)
    expect(screen.getByText('كيف تُحسب هذه الأرقام؟')).toBeInTheDocument();
  });

  it('updates the hero headline when cars/day changes', () => {
    const { container } = render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Capture the hero profit number before the change
    const heroBefore = container.querySelector('[data-testid="hero-total-profit"]')?.textContent ?? '';
    expect(heroBefore).toMatch(/ج\.م/);

    // Change cars/day to 150 — boosts gross monthly run-rate from 10,000 to 15,000
    fireEvent.change(screen.getByRole('spinbutton', { name: 'سيارات/يوم لكل جراج' }), { target: { value: '150' } });

    // Hero total profit must reflect the new run-rate
    const heroAfter = container.querySelector('[data-testid="hero-total-profit"]')?.textContent ?? '';
    expect(heroAfter).toMatch(/ج\.م/);
    expect(heroAfter).not.toEqual(heroBefore);
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
    expect(screen.queryByText(/حصة المستثمرين/)).not.toBeInTheDocument();
    expect(screen.queryByText(/متوسط لكل مستثمر شهريًا/)).not.toBeInTheDocument();

    // Open investor settings and set ownership > 0
    fireEvent.click(screen.getByText('إعدادات المستثمرين'));
    expect(investorSettings).toHaveAttribute('open');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'نسبة ملكية المستثمرين' }), { target: { value: '25' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'عدد المستثمرين' }), { target: { value: '1' } });

    // Investor breakdown now appears inline under the hero
    expect(screen.getByText(/حصة المستثمرين/)).toBeInTheDocument();
    expect(screen.getByText(/متوسط لكل مستثمر شهريًا/)).toBeInTheDocument();
  });

  it('hides the acquisition-cost detail behind the how-its-calculated disclosure, then reveals it when opened', () => {
    render(<AdminPartnerDividendCard currentActiveGarages={5} />);

    // Acquisition-cost explanation text exists in the DOM (collapsed disclosure) but is not visible by default
    const howDetails = screen.getByText('كيف تُحسب هذه الأرقام؟').closest('details');
    expect(howDetails).not.toHaveAttribute('open');

    // Open the disclosure
    fireEvent.click(screen.getByText('كيف تُحسب هذه الأرقام؟'));
    expect(howDetails).toHaveAttribute('open');

    // Acquisition cost detail is now visible inside the disclosure
    expect(screen.getByText(/100 رصيد تجريبي/)).toBeInTheDocument();
    expect(screen.getByText(/20 رصيد إحالة/)).toBeInTheDocument();
  });
});
