/**
 * Formatters and input normalizers
 */
import { normalizeDigits as baseNormalizeDigits } from './index';

/**
 * Converts Eastern Arabic (١٢٣) and Persian (۱۲۳) numerals to Western Arabic numerals (123).
 */
export const normalizeDigits = (input: string): string => {
  return baseNormalizeDigits(input);
};
