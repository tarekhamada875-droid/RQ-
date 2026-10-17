import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCreditActivityReportPanel } from './AdminCreditActivityReportPanel';
import { adminService } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  adminService: { getFinancialReport: vi.fn() },
}));

const creditActivity = {
  paidGrantCount: 1,
  paidCreditsGranted: 500,
  paidGrantCountWithoutEgpRecord: 0,
  paidCreditsWithoutEgpRecord: 0,
  referralAwardCount: 1,
  referralCreditsGranted: 20,
  trialGrantCount: 0,
  trialCreditsGranted: 0,
  regularEntryDebitCount: 2,
  regularEntryCreditsConsumed: 2,
  regularEntryPaidCreditsConsumed: 2,
  regularEntryReferralCreditsConsumed: 0,
  regularEntryTrialCreditsConsumed: 0,
  subscriberRenewalCount: 1,
  subscriberRenewalCreditsConsumed: 5,
  correctionRestoreCount: 0,
  restoredCredits: 0,
  restoredPaidCredits: 0,
  restoredReferralCredits: 0,
  restoredTrialCredits: 0,
};

beforeEach(() => vi.clearAllMocks());

describe('AdminCreditActivityReportPanel', () => {
  it('shows the verified EGP transfer separately from paid and used credits', async () => {
    vi.mocked(adminService.getFinancialReport).mockResolvedValue({
      grossRechargeTotal: 0,
      walletTopupTotal: 0,
      prepaidCreditPaymentsEgp: 500,
      cashCollectedTotal: 500,
      commissionTotal: 0,
      refundTotal: 0,
      companyNetRevenue: 500,
      historicalSettledTotal: 0,
      currentUnsettledByDelegate: {},
      creditActivity,
    });

    render(<AdminCreditActivityReportPanel adminLang="en" />);

    expect(await screen.findByText('500 EGP')).toBeTruthy();
    expect(screen.getByText('500 credits')).toBeTruthy();
    expect(screen.getByText('20 credits')).toBeTruthy();
    expect(screen.getByText('2 credits')).toBeTruthy();
    expect(screen.getByText('5 credits')).toBeTruthy();
    expect(screen.getByText(/Money is shown in EGP; usage is shown in credits/)).toBeTruthy();
  });
});
