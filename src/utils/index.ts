/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barrel re-export for utils sub-modules.
 *
 * Previously this was a 460-LOC god-file mixing 6 unrelated domains
 * (dates, plates, cost, pins, colors, storage). It is now split into
 * focused sub-modules; this file re-exports everything so existing
 * `import { ... } from '../../utils'` calls keep working unchanged.
 *
 * New code should import from the specific sub-module directly:
 *   import { safeDate } from '../../utils/dates';
 *   import { getRawPlate } from '../../utils/plates';
 */

export {
  safeDate,
  sortGaragesNewestFirst,
  getDuration,
  formatEntryTimeParts,
  isSessionActive,
} from './dates';

export {
  normalizeDigits,
  normalizeLetters,
  normalizeArabicSearch,
  getCleanPlate,
  getRawPlate,
  getPlateParts,
  isPlateValid,
  normalizePhone,
  formatPlateNumber,
} from './plates';
export type { PlateParts } from './plates';

export { calculateCost } from './cost';

export {
  NEW_PIN_LENGTH,
  generateSafePin,
  isHashedPin,
  formatDisplayPin,
} from './pins';

export {
  resolveShimmerColor,
  isLightColor,
} from './colors';

export {
  canChangeGarageRates,
} from './businessRules';

export {
  getStorage,
  throttleSnapshot,
} from './storage';
