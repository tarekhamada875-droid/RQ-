import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Garage } from '../../types';
import { adminService } from '../../services/adminService';
import { TrialExpiryModal } from './TrialExpiryModal';

vi.mock('../../services/adminService', () => ({
  adminService: {
    updateTrialDecision: vi.fn()
  }
}));

const mockedUpdateTrialDecision = vi.mocked(adminService.updateTrialDecision);
const createExpiredGarage = (): Garage => ({
  id: 'garage_test',
  name: 'Test Garage',
  isTrial: true,
  balanceExpiry: new Date('2020-01-01T00:00:00.000Z'),
  trialDecision: null
} as Garage);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mockedUpdateTrialDecision.mockReset();
  mockedUpdateTrialDecision.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  localStorage.clear();
});

async function submitAndFlush(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
}

async function advanceDismissDelay() {
  await act(async () => {
    vi.advanceTimersByTime(2500);
  });
}

describe('TrialExpiryModal', () => {
  it('records continuation and dismisses after showing the success state without onClose', async () => {
    render(<TrialExpiryModal garage={createExpiredGarage()} />);

    await submitAndFlush(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ }));

    expect(mockedUpdateTrialDecision).toHaveBeenCalledWith('garage_test', 'continued');
    expect(screen.getByText('شُكراً لثقتك بنا! ❤️')).toBeInTheDocument();

    await advanceDismissDelay();
    expect(screen.queryByText('شُكراً لثقتك بنا! ❤️')).not.toBeInTheDocument();
  });

  it('confirms decline, records it, and dismisses after showing the success state', async () => {
    render(<TrialExpiryModal garage={createExpiredGarage()} />);

    fireEvent.click(screen.getByRole('button', { name: /لا، لا أرغب في الاستمرار/ }));
    await submitAndFlush(screen.getByRole('button', { name: /تأكيد عدم الاستمرار/ }));

    expect(mockedUpdateTrialDecision).toHaveBeenCalledWith('garage_test', 'declined');
    expect(screen.getByText('تم تسجيل اختيارك')).toBeInTheDocument();

    await advanceDismissDelay();
    expect(screen.queryByText('تم تسجيل اختيارك')).not.toBeInTheDocument();
  });

  it('keeps the decision controls available and reports an error when saving fails', async () => {
    const showToast = vi.fn();
    mockedUpdateTrialDecision.mockRejectedValueOnce(new Error('FORBIDDEN'));
    render(<TrialExpiryModal garage={createExpiredGarage()} showToast={showToast} />);

    await submitAndFlush(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ }));

    expect(showToast).toHaveBeenCalledWith('حدث خطأ أثناء حفظ اختيارك، يرجى المحاولة مرة أخرى.', 'error');
    expect(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ })).toBeEnabled();
    expect(screen.getByText('انتهت الفترة التجريبية للجراج')).toBeInTheDocument();
  });

  it('does not render for non-trial garages even if expired', () => {
    const nonTrialGarage = { ...createExpiredGarage(), isTrial: false };
    render(<TrialExpiryModal garage={nonTrialGarage} />);
    expect(screen.queryByText('انتهت الفترة التجريبية للجراج')).not.toBeInTheDocument();
  });

  it('does not render when trialDecision has already been made', () => {
    const decidedGarage = { ...createExpiredGarage(), trialDecision: 'continued' as const };
    render(<TrialExpiryModal garage={decidedGarage} />);
    expect(screen.queryByText('انتهت الفترة التجريبية للجراج')).not.toBeInTheDocument();
  });
});

export {};
