import { z } from 'zod';
import { addMinorUnits, subtractMinorUnits } from './money.js';

export const DiscountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('percentage'), value: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('fixed'), valueMinor: z.number().int().nonnegative() })
]);

export type Discount = z.infer<typeof DiscountSchema>;

export type PricingInput = Readonly<{
  basePriceMinor: number;
  discount: Discount;
  subscriberFeeMinor?: number;
  referralCommissionMinor?: number;
}>;

export type PricingResult = Readonly<{
  basePriceMinor: number;
  discountMinor: number;
  discountedPriceMinor: number;
  subscriberFeeMinor: number;
  referralCommissionMinor: number;
  finalPriceMinor: number;
}>;

export function calculatePackagePrice(input: PricingInput): PricingResult {
  if (!Number.isSafeInteger(input.basePriceMinor) || input.basePriceMinor < 0) throw new Error('Invalid base price');
  const discount = DiscountSchema.parse(input.discount);
  const subscriberFeeMinor = input.subscriberFeeMinor ?? 0;
  const referralCommissionMinor = input.referralCommissionMinor ?? 0;
  if (![subscriberFeeMinor, referralCommissionMinor].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Invalid pricing adjustment');
  }

  const discountMinor = discount.kind === 'none'
    ? 0
    : discount.kind === 'percentage'
      ? Math.round((input.basePriceMinor * discount.value) / 100)
      : discount.valueMinor;
  if (discountMinor > input.basePriceMinor) throw new Error('Discount exceeds base price');
  const discountedPriceMinor = subtractMinorUnits(input.basePriceMinor, discountMinor);
  const finalPriceMinor = addMinorUnits(addMinorUnits(discountedPriceMinor, subscriberFeeMinor), referralCommissionMinor);
  return { basePriceMinor: input.basePriceMinor, discountMinor, discountedPriceMinor, subscriberFeeMinor, referralCommissionMinor, finalPriceMinor };
}
