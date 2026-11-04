/**
 * Re-export barrel for backward compatibility.
 *
 * Previously this file contained 417 lines mixing PIN crypto, PIN Firestore
 * operations, and vehicle cost calculation. These have been split into:
 *
 *   - server/pinCrypto.ts        (hashing, verification, normalizeDigits)
 *   - server/pinRepository.ts    (Firestore CRUD for private_pins)
 *   - server/domain/vehicleCost.ts (vehicle cost calculation)
 *
 * New imports should target the specific module. This barrel is kept
 * so existing import statements don't break during the transition.
 */

export {
  normalizeDigits,
  cleanPin,
  hashPinWithUniqueSalt,
  computeLookupHash,
  verifyScryptHash,
  verifySingleFieldValue,
  verifyPinMatch,
  verifyDocMatch,
} from './pinCrypto';

export {
  saveEntityPinInTransaction,
  deleteEntityPinInTransaction,
  saveEntityPin,
  migratePinToHash,
  getAdminPin,
  queryAccountWherePin,
  queryDelegatesWherePhone,
  checkPinAvailabilityAcrossAll,
} from './pinRepository';

export { calculateVehicleCost } from './domain/vehicleCost';
