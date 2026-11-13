import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditGrantNotificationModal } from './CreditGrantNotificationModal';
import type { ActivityLog } from '../../../types';

/**
 * Regression tests for the prepaid credit top-up notification.
 *
 * Owner bug report (2026-11-13): topping up a prepaid garage's credits by 50
 * popped the legacy subscription-renewal popup showing "الباقة: الباقة" and
 * "مجاناً (فترة تجريبية)" — because the Worker writes the admin grant log as
 * actionType:'credit_grant' with details:{amount, reason} and no package
 * identity, so the legacy layout fell into its fallback strings.
 */

const baseLog = (overrides: Partial<ActivityLog> = {}): ActivityLog => ({
  id: 'log-1',
  garageId: 'garage-1',
  staffId: 'admin-1',
  staffName: 'Admin',
  actionType: 'credit_grant',
  plateNumber: '',
  timestamp: new Date('2026-11-13T12:00:00Z'),
  ...overrides,
});

// Matches the Worker's admin-grant log shape (creditGrantRoutes.ts):
// details.amount is the credit amount; there is no top-level amount field.
const topUpLog = baseLog({
  details: {
    amount: 50,
    paymentAmountEgp: 50,
    reason: 'إضافة رصيد 50',
    ledgerEntryId: 'entry-1',
  } as any,
});

describe('CreditGrantNotificationModal — prepaid credit top-up branch', () => {
  it('renders the clean top-up card: title, +N رصيد, current balance, no subscription wording', () => {
    render(
      <CreditGrantNotificationModal
        isOpen
        creditGrantLog={topUpLog}
        currentCredits={119}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('تم شحن الرصيد بنجاح!')).toBeInTheDocument();
    expect(screen.getByText(`+${(50).toLocaleString('ar-EG')} رصيد`)).toBeInTheDocument();
    expect(screen.getByText('الرصيد الحالي:')).toBeInTheDocument();
    expect(screen.getByText((119).toLocaleString('ar-EG'))).toBeInTheDocument();

    // The exact nonsense the owner saw must never come back:
    expect(screen.queryByText(/تجديد الاشتراك/)).not.toBeInTheDocument();
    expect(screen.queryByText(/مجاناً/)).not.toBeInTheDocument();
    expect(screen.queryByText(/الباقة/)).not.toBeInTheDocument();
  });

  it('hides the balance row when currentCredits is unknown instead of guessing', () => {
    render(
      <CreditGrantNotificationModal isOpen creditGrantLog={topUpLog} onClose={() => {}} />
    );

    expect(screen.queryByText('الرصيد الحالي:')).not.toBeInTheDocument();
    expect(screen.getByText('التاريخ:')).toBeInTheDocument();
    expect(screen.getByText('تمام')).toBeInTheDocument();
  });

  it('keeps the legacy subscription layout when the log carries a package name', () => {
    const packageLog = baseLog({
      amount: 100,
      details: { packageName: 'الباقة الكاملة' } as any,
    });
    render(
      <CreditGrantNotificationModal
        isOpen
        creditGrantLog={packageLog}
        currentCredits={119}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('تم تجديد الاشتراك بنجاح!')).toBeInTheDocument();
    expect(screen.getByText('الباقة الكاملة')).toBeInTheDocument();
    expect(screen.getByText('100 ج.م')).toBeInTheDocument();
    expect(screen.queryByText('تم شحن الرصيد بنجاح!')).not.toBeInTheDocument();
  });

  it('keeps the trial layout intact (trial grants stay "مجاناً")', () => {
    const trialLog = baseLog({
      packageId: 'trial',
      details: { packageName: 'الباقة التجريبية' } as any,
    });
    render(
      <CreditGrantNotificationModal isOpen creditGrantLog={trialLog} onClose={() => {}} />
    );

    expect(screen.getByText(/الباقة التجريبية بنجاح/)).toBeInTheDocument();
    expect(screen.getByText('مجاناً (فترة تجريبية)')).toBeInTheDocument();
  });

  it('renders nothing for referral-reward usage logs (existing guard)', () => {
    const { container } = render(
      <CreditGrantNotificationModal
        isOpen
        creditGrantLog={baseLog({ details: { type: 'use_referral_reward' } as any })}
        onClose={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
