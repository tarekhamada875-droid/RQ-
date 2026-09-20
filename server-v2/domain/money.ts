export function parseMinorUnits(value: string, decimals = 2): number {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid non-negative monetary value');
  const [wholePart, fractionPart = ''] = value.split('.');
  if (fractionPart.length > decimals) throw new Error('Too many fractional digits');
  const scale = 10 ** decimals;
  const fraction = fractionPart.padEnd(decimals, '0');
  const result = Number(wholePart) * scale + Number(fraction || 0);
  if (!Number.isSafeInteger(result)) throw new Error('Monetary value exceeds safe integer range');
  return result;
}

export function addMinorUnits(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new Error('Money must use safe integers');
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error('Money result exceeds safe integer range');
  return result;
}

export function subtractMinorUnits(left: number, right: number): number {
  return addMinorUnits(left, -right);
}

export function formatMinorUnits(value: number, decimals = 2): string {
  if (!Number.isSafeInteger(value)) throw new Error('Money must use safe integers');
  const scale = 10 ** decimals;
  return (value / scale).toFixed(decimals);
}
