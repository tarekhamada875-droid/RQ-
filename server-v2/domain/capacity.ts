export type CapacityInput = Readonly<{
  isTrial?: boolean;
  dailyCapacity: number;
}>;

export function effectiveDailyCapacity(input: CapacityInput): number {
  if (input.isTrial === true) return 100;
  if (!Number.isInteger(input.dailyCapacity) || input.dailyCapacity < 0) throw new Error('Invalid daily capacity');
  return input.dailyCapacity;
}

export function isUnlimitedCapacity(input: CapacityInput): boolean {
  return effectiveDailyCapacity(input) === 0 && input.isTrial !== true;
}

export function canAcceptVehicle(input: CapacityInput & { carsInside: number }): boolean {
  const capacity = effectiveDailyCapacity(input);
  if (!Number.isInteger(input.carsInside) || input.carsInside < 0) throw new Error('Invalid cars-inside count');
  return capacity === 0 || input.carsInside < capacity;
}
