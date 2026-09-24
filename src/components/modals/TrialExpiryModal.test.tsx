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
const expiredGarage = {
  id: 'garage_test',
  name: 'Test Garage',
  isTrial: true,
  balanceExpiry: new Date('2020-01-01T00:00:00.000Z'),
  trialDecision: null
} as Garage;

beforeEach(() => {
  vi.useFakeTimers();
  mockedUpdateTrialDecision.mockReset();
  mockedUpdateTrialDecision.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
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
    render(<TrialExpiryModal garage={expiredGarage} />);

    await submitAndFlush(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ }));

    expect(mockedUpdateTrialDecision).toHaveBeenCalledWith('garage_test', 'continued');
    expect(screen.getByText('شُكراً لثقتك بنا! ❤️')).toBeInTheDocument();

    await advanceDismissDelay();
    expect(screen.queryByText('شُكراً لثقتك بنا! ❤️')).not.toBeInTheDocument();
  });

  it('confirms decline, records it, and dismisses after showing the success state', async () => {
    render(<TrialExpiryModal garage={expiredGarage} />);

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
    render(<TrialExpiryModal garage={expiredGarage} showToast={showToast} />);

    await submitAndFlush(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ }));

    expect(showToast).toHaveBeenCalledWith('حدث خطأ أثناء حفظ اختيارك، يرجى المحاولة مرة أخرى.', 'error');
    expect(screen.getByRole('button', { name: /نعم، أرغب في الاستمرار والتجديد/ })).toBeEnabled();
    expect(screen.getByText('انتهت الفترة التجريبية للجراج')).toBeInTheDocument();
  });
});

export {};
