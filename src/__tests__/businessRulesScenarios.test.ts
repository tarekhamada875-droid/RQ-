import { describe, it, expect } from 'vitest';
import { canChangeGarageRates, getPackageRechargeRestrictions } from '../utils';

describe('Production Business Rules Scenarios', () => {
  describe('Rule: Garage Rates Modification Limit (Once every 30 days)', () => {
    it('allows rate change if lastRateChangeDate is null or undefined', () => {
      const garage = { id: 'g1', hourlyRate: 10, overnightRate: 50 };
      const check = canChangeGarageRates(garage);
      expect(check.allowed).toBe(true);
      expect(check.daysRemaining).toBe(0);
    });

    it('blocks rate change if changed recently (e.g. 5 days ago)', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const garage = { id: 'g1', hourlyRate: 10, overnightRate: 50, lastRateChangeDate: fiveDaysAgo };
      const check = canChangeGarageRates(garage);
      expect(check.allowed).toBe(false);
      expect(check.daysRemaining).toBe(25);
    });

    it('blocks rate change if changed 29 days ago', () => {
      const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const garage = { id: 'g1', hourlyRate: 10, overnightRate: 50, lastRateChangeDate: twentyNineDaysAgo };
      const check = canChangeGarageRates(garage);
      expect(check.allowed).toBe(false);
      expect(check.daysRemaining).toBe(1);
    });

    it('allows rate change if 30 days or more have passed', () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const garage = { id: 'g1', hourlyRate: 10, overnightRate: 50, lastRateChangeDate: thirtyOneDaysAgo };
      const check = canChangeGarageRates(garage);
      expect(check.allowed).toBe(true);
      expect(check.daysRemaining).toBe(0);
    });
  });

  describe('Rule: Monthly Subscribers Garage Package Restrictions', () => {
    it('restricts package recharge to 30-day packages when hasMonthlySubscribers is true', () => {
      const garage = { id: 'g1', hasMonthlySubscribers: true };
      
      const pkg7Days = { id: 'pkg_7', name: 'باقة أسبوعية', durationDays: 7 };
      const check7 = getPackageRechargeRestrictions(garage, pkg7Days);
      expect(check7.isAllowed).toBe(false);

      const pkg15Days = { id: 'pkg_15', name: 'باقة 15 يوم', durationDays: 15 };
      const check15 = getPackageRechargeRestrictions(garage, pkg15Days);
      expect(check15.isAllowed).toBe(false);

      const pkg30Days = { id: 'pkg_30', name: 'باقة شهرية', durationDays: 30 };
      const check30 = getPackageRechargeRestrictions(garage, pkg30Days);
      expect(check30.isAllowed).toBe(true);
    });

    it('allows all valid packages when hasMonthlySubscribers is false', () => {
      const garage = { id: 'g2', hasMonthlySubscribers: false };
      
      const pkg7Days = { id: 'pkg_7', name: 'باقة أسبوعية', durationDays: 7 };
      const check7 = getPackageRechargeRestrictions(garage, pkg7Days);
      expect(check7.isAllowed).toBe(true);

      const pkg30Days = { id: 'pkg_30', name: 'باقة شهرية', durationDays: 30 };
      const check30 = getPackageRechargeRestrictions(garage, pkg30Days);
      expect(check30.isAllowed).toBe(true);
    });
  });
});
