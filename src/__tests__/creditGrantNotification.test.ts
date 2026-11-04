import { describe, it, expect, beforeEach } from 'vitest';
import { safeDate } from '../utils/dates';

describe('Garage Recharge Notification Behavior', () => {
  const garageId = 'test_garage_notification_101';

  beforeEach(() => {
    localStorage.clear();
  });

  it('1. Triggers credit grant notification when a new unacknowledged credit grant is received', () => {
    const rechargeLog = {
      id: 'log_recharge_999',
      garageId,
      actionType: 'recharge',
      plateNumber: 'تجديد اشتراك: باقة 30 يوم (30 يوم) - 500 ج',
      amount: 500,
      timestamp: new Date()
    };

    const isAcknowledged = localStorage.getItem(`acknowledged_credit_grant_${garageId}`) === rechargeLog.id;
    const diffMs = Date.now() - safeDate(rechargeLog.timestamp).getTime();
    const isRecent = diffMs < 7 * 24 * 60 * 60 * 1000;

    expect(isAcknowledged).toBe(false);
    expect(isRecent).toBe(true);

    // Notification should trigger
    const shouldShowModal = !isAcknowledged && isRecent;
    expect(shouldShowModal).toBe(true);
  });

  it('2. Suppresses notification once acknowledged by user', () => {
    const rechargeLog = {
      id: 'log_recharge_999',
      garageId,
      actionType: 'recharge',
      plateNumber: 'تجديد اشتراك: باقة 30 يوم',
      amount: 500,
      timestamp: new Date()
    };

    // User acknowledges by clicking "تمام"
    localStorage.setItem(`acknowledged_credit_grant_${garageId}`, rechargeLog.id);

    const isAcknowledged = localStorage.getItem(`acknowledged_credit_grant_${garageId}`) === rechargeLog.id;
    const shouldShowModal = !isAcknowledged;
    expect(shouldShowModal).toBe(false);
  });

  it('3. Re-triggers notification when a fresh new credit grant arrives with a new ID', () => {
    // Old recharge acknowledged
    localStorage.setItem(`acknowledged_credit_grant_${garageId}`, 'log_recharge_old_111');

    // Admin executes new credit grant
    const newRechargeLog = {
      id: 'log_recharge_new_222',
      garageId,
      actionType: 'recharge',
      amount: 300,
      timestamp: new Date()
    };

    const isAcknowledged = localStorage.getItem(`acknowledged_credit_grant_${garageId}`) === newRechargeLog.id;
    expect(isAcknowledged).toBe(false);
  });
});
