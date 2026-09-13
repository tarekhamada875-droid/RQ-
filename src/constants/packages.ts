import { Package } from '../types';

export const BALANCE_PRESET_AMOUNTS = [100, 200, 300, 500] as const;

export const DEFAULT_PACKAGES: Package[] = [
  // 1-Day Packages
  { id: 'daily_30', name: 'باقة 30 سيارة/يوم', price: 15, durationDays: 1, vehiclesCount: 1, dailyCapacity: 30, isActive: true },
  { id: 'daily_50', name: 'باقة 50 سيارة/يوم', price: 25, durationDays: 1, vehiclesCount: 1, dailyCapacity: 50, isActive: true },
  { id: 'daily_unlimited', name: 'باقة سعة مفتوحة', price: 40, durationDays: 1, vehiclesCount: 1, dailyCapacity: 0, isActive: true },
  
  // 15-Day Packages (Half-Month)
  { id: 'biweekly_30', name: 'باقة 30 سيارة/يوم', price: 120, durationDays: 15, vehiclesCount: 15, dailyCapacity: 30, isActive: true },
  { id: 'biweekly_50', name: 'باقة 50 سيارة/يوم', price: 180, durationDays: 15, vehiclesCount: 15, dailyCapacity: 50, isActive: true },
  { id: 'biweekly_unlimited', name: 'باقة سعة مفتوحة', price: 280, durationDays: 15, vehiclesCount: 15, dailyCapacity: 0, isActive: true },

  // 30-Day Packages (Month)
  { id: 'monthly_30', name: 'باقة 30 سيارة/يوم', price: 200, durationDays: 30, vehiclesCount: 30, dailyCapacity: 30, isActive: true },
  { id: 'monthly_50', name: 'باقة 50 سيارة/يوم', price: 300, durationDays: 30, vehiclesCount: 30, dailyCapacity: 50, isActive: true },
  { id: 'monthly_unlimited', name: 'باقة سعة مفتوحة', price: 450, durationDays: 30, vehiclesCount: 30, dailyCapacity: 0, isActive: true },
];

export const getDefaultDurationFilter = (packages: Package[], hasMonthlySubscribers: boolean = false): number => {
  const durations = filterPackagesForGarage(packages, hasMonthlySubscribers).map(p => getCleanPackageInfo(p).durationDays);
  if (hasMonthlySubscribers) {
    if (durations.includes(30)) return 30;
    return durations.length > 0 ? durations[0] : 30;
  }
  if (durations.includes(1)) return 1;
  if (durations.includes(15)) return 15;
  if (durations.includes(30)) return 30;
  if (durations.includes(7)) return 7;
  return durations.length > 0 ? durations[0] : 30;
};

export const filterPackagesForGarage = (packages: Package[], hasMonthlySubscribers: boolean = false): Package[] => {
  if (!packages || !Array.isArray(packages)) return [];
  if (!hasMonthlySubscribers) return packages;
  return packages.filter(p => {
    const info = getCleanPackageInfo(p);
    return info.durationDays === 30;
  });
};

const DURATION_TEXT_MAP: Record<number, string> = {
  30: 'شهر كامل (30 يوم)',
  15: 'نصف شهر (15 يوم)',
  1: 'يوم واحد (1 يوم)',
  7: 'أسبوع (7 أيام)'
};

export const getCleanPackageInfo = (pkg: Partial<Package> | any) => {
  // 1. Duration Days
  let durationDays = 30;
  if (typeof pkg.durationDays === 'number' && pkg.durationDays > 0 && pkg.durationDays <= 365) {
    durationDays = pkg.durationDays;
  } else {
    const name = (pkg.name || '').trim();
    const pkgId = (pkg.id || '').trim().toLowerCase();

    if (/^(daily|1day|1_day|day_sub)/.test(pkgId)) {
      durationDays = 1;
    } else if (/^(weekly|7days|week_sub)/.test(pkgId)) {
      durationDays = 7;
    } else if (/^(biweekly|15days|half_month)/.test(pkgId)) {
      durationDays = 15;
    } else if (/^(monthly|30days|month_sub)/.test(pkgId)) {
      durationDays = 30;
    } else if (/15|نصف شهر|15-day/i.test(name)) {
      durationDays = 15;
    } else if (/7|أسبوع|7 days/i.test(name)) {
      durationDays = 7;
    } else if (/30|شهر|30 days/i.test(name)) {
      durationDays = 30;
    } else if (/يومي|يوم واحد|1 يوم|1-day|1 day|يوم/i.test(name)) {
      durationDays = 1;
    } else if (typeof pkg.vehiclesCount === 'number' && [1, 7, 15, 30].includes(pkg.vehiclesCount)) {
      durationDays = pkg.vehiclesCount;
    }
  }

  // 2. Daily Capacity
  let dailyCapacity: number | null = null;
  let isUnlimited = false;

  if (pkg.dailyCapacity === 0 || /مفتوح|غير محدود|غير محدودة|بدون حدود/.test(pkg.name || '')) {
    isUnlimited = true;
  } else if (typeof pkg.dailyCapacity === 'number' && pkg.dailyCapacity > 0) {
    dailyCapacity = pkg.dailyCapacity;
  } else {
    const match = (pkg.name || '').match(/(\d+)\s*سيارة/);
    if (match && match[1]) {
      const parsedCap = parseInt(match[1], 10);
      if (parsedCap > 0 && parsedCap <= 1000) {
        dailyCapacity = parsedCap;
      }
    } else if (typeof pkg.vehiclesCount === 'number' && pkg.vehiclesCount > 0 && pkg.vehiclesCount <= 500 && pkg.vehiclesCount !== durationDays) {
      dailyCapacity = pkg.vehiclesCount;
    }
  }

  if (!isUnlimited && (!dailyCapacity || dailyCapacity <= 0)) {
    dailyCapacity = 50;
  }

  // 3. Duration Text & Display Name
  const durationText = DURATION_TEXT_MAP[durationDays] || `${durationDays} يوم`;
  const displayName = pkg.name || (isUnlimited ? 'باقة سعة مفتوحة' : `باقة ${dailyCapacity} سيارة/يوم`);

  return {
    durationDays,
    dailyCapacity,
    isUnlimited,
    durationText,
    displayName
  };
};
