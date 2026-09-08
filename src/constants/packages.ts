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

export const getCleanPackageInfo = (pkg: Partial<Package> | any) => {
  // 1. Duration Days
  let durationDays = 30;
  if (typeof pkg.durationDays === 'number' && pkg.durationDays > 0 && pkg.durationDays <= 365) {
    durationDays = pkg.durationDays;
  } else {
    const name = (pkg.name || '').trim();
    const pkgId = (pkg.id || '').trim().toLowerCase();

    if (pkgId.startsWith('daily') || pkgId === '1day' || pkgId === '1_day' || pkgId === 'day_sub' || pkgId === 'daily') {
      durationDays = 1;
    } else if (pkgId.startsWith('weekly') || pkgId === '7days' || pkgId === 'week_sub') {
      durationDays = 7;
    } else if (pkgId.startsWith('biweekly') || pkgId === '15days' || pkgId === 'half_month') {
      durationDays = 15;
    } else if (pkgId.startsWith('monthly') || pkgId === '30days' || pkgId === 'month_sub') {
      durationDays = 30;
    } else if (name.includes('15') || name.includes('15 يوم') || name.includes('نصف شهر') || name.includes('15 days') || name.includes('15-day')) {
      durationDays = 15;
    } else if (name.includes('يومي') || name.includes('يوم واحد') || name.includes('1 يوم') || name.includes('1-day') || name.includes('1 day') || name.includes('يوم')) {
      durationDays = 1;
    } else if (name.includes('7') || name.includes('أسبوع') || name.includes('7 أيام') || name.includes('7 days')) {
      durationDays = 7;
    } else if (name.includes('30') || name.includes('شهر') || name.includes('30 يوم') || name.includes('30 days')) {
      durationDays = 30;
    } else if (typeof pkg.vehiclesCount === 'number' && [1, 7, 15, 30].includes(pkg.vehiclesCount)) {
      durationDays = pkg.vehiclesCount;
    }
  }

  // 2. Daily Capacity
  let dailyCapacity: number | null = null;
  let isUnlimited = false;

  if (pkg.dailyCapacity === 0 || pkg.name?.includes('مفتوح') || pkg.name?.includes('غير محدود') || pkg.name?.includes('غير محدودة') || pkg.name?.includes('بدون حدود')) {
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

  // 3. Duration Text
  let durationText = `${durationDays} يوم`;
  if (durationDays === 30) {
    durationText = 'شهر كامل (30 يوم)';
  } else if (durationDays === 15) {
    durationText = 'نصف شهر (15 يوم)';
  } else if (durationDays === 1) {
    durationText = 'يوم واحد (1 يوم)';
  } else if (durationDays === 7) {
    durationText = 'أسبوع (7 أيام)';
  }

  // 4. Display Name
  let displayName = pkg.name;
  if (!displayName) {
    displayName = isUnlimited ? 'باقة سعة مفتوحة' : `باقة ${dailyCapacity} سيارة/يوم`;
  }

  return {
    durationDays,
    dailyCapacity,
    isUnlimited,
    durationText,
    displayName
  };
};
