/**
 * PIN cryptography helpers — hashing, verification, and digit normalization.
 *
 * Contains the scrypt-based hashing and verification logic for PIN credentials.
 */
import crypto from 'crypto';

export function normalizeDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9');
}

export function cleanPin(raw: any): string {
  return normalizeDigits(String(raw || '')).replace(/\D/g, '');
}

/**
 * Normalizes a phone number for storage and lookup. Keeps the leading `+`
 * (if present) and digits only — strips spaces, dashes, parens, etc.
 *
 * Audit ref: Phase 1 / N9 (consolidated audit, 2026-11-06).
 *
 * The previous delegate-login path used `cleanPin(credentials.phone)` which
 * strips ALL non-digits including `+`. This meant a delegate who registered
 * with `+20 100 123 4567` (normalized by the client's `normalizePhone` to
 * `+201001234567`) could not log in, because the server's `cleanPin` would
 * produce `201001234567` (no `+`) and the lookup would miss the stored doc.
 *
 * Now both client (`src/utils/plates.ts:normalizePhone`) and server use
 * the same rule: keep `+` and digits, strip everything else.
 */
export function normalizePhone(raw: any): string {
  return normalizeDigits(String(raw || '').trim()).replace(/[^\d+]/g, '');
}

// ── PIN lookup salt ────────────────────────────────────────────────────────
//
// Audit ref: Phase 1 / N22 (consolidated audit, 2026-11-06).
//
// SECURITY NOTE: the previous version hardcoded this salt in source, making
// it public knowledge. An attacker who reads the salt can precompute rainbow
// tables for all 100,000 5-digit PINs once, then look up any pinLookupHash
// they read (via a Firestore rules bug, leaked log, etc.) to recover the
// plaintext PIN.
//
// Migration path:
//   1. (default) If env.PIN_LOOKUP_SALT is unset, the LEGACY hardcoded
//      value is used. This preserves backward compat with existing
//      pinLookupHash values in the DB. Production keeps working but the
//      salt is still effectively public.
//   2. (operator action) Set the PIN_LOOKUP_SALT secret binding in
//      Cloudflare (wrangler.toml [vars] OR `wrangler secret put
//      PIN_LOOKUP_SALT`) to a fresh, random 32+ character string.
//      After this deploys, NEW pinLookupHash values are computed with
//      the new salt. EXISTING pinLookupHash values were computed with
//      the legacy salt and will not match the new computation — so PIN
//      lookups will fall back to the legacy salt (see computeLookupHash
//      + computeLegacyLookupHash below).
//   3. (operator action, optional) Force-rotate all existing PINs to
//      rehash with the new salt. After this, the legacy salt can be
//      removed entirely.
//
// To generate a fresh salt: `openssl rand -hex 32` (64 hex chars = 32 bytes).
const LEGACY_PIN_LOOKUP_SALT = 'ark_garage_secure_pin_lookup_salt_v2';

// The active salt is resolved lazily on first use, then cached. Tests that
// mock pinCrypto don't need to worry about this — they don't read env.
let cachedActiveSalt: string | null = null;
let cachedActiveSaltEnv: string | null = null;

function resolveActiveSalt(): string {
  // Read from Cloudflare Worker env (preferred) or fall back to the legacy
  // hardcoded value. We can't import the WorkerEnv type here without a
  // circular dependency, so we read from `globalThis` / `process.env` /
  // the worker env injected onto globalThis.
  //
  // Note: in Cloudflare Workers, env vars are passed to the fetch handler,
  // not made available on globalThis by default. The Worker entry
  // (cloudflareWorker.ts) is responsible for setting
  // globalThis.__RQ_PIN_LOOKUP_SALT__ from env.PIN_LOOKUP_SALT before
  // any PIN auth route runs. See cloudflareWorker.ts.
  const envSalt =
    (typeof globalThis !== 'undefined' && (globalThis as any).__RQ_PIN_LOOKUP_SALT__) ||
    (typeof process !== 'undefined' && process.env && process.env.PIN_LOOKUP_SALT) ||
    null;
  if (envSalt && typeof envSalt === 'string' && envSalt.trim().length >= 16) {
    if (cachedActiveSaltEnv !== envSalt) {
      cachedActiveSalt = envSalt.trim();
      cachedActiveSaltEnv = envSalt;
    }
    return cachedActiveSalt!;
  }
  return LEGACY_PIN_LOOKUP_SALT;
}

export function hashPinWithUniqueSalt(cleanPinStr: string, saltHex?: string): string {
  if (!cleanPinStr) return '';
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const actualSaltHex = salt.toString('hex');
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(cleanPinStr, salt, 32, { N, r, p }).toString('hex');
  return `$scrypt$N=${N},r=${r},p=${p}$${actualSaltHex}$${derived}`;
}

/**
 * Computes the lookup hash using the ACTIVE salt (env-derived if set,
 * legacy hardcoded value otherwise). Use this when STORING a new
 * pinLookupHash — so that new PINs always use the strongest available
 * salt.
 */
export function computeLookupHash(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, resolveActiveSalt(), 32).toString('hex');
}

/**
 * Computes the lookup hash using the LEGACY hardcoded salt. Use this
 * when LOOKING UP an existing PIN by hash, to handle the migration case
 * where the DB still contains pinLookupHash values computed with the
 * legacy salt. After all PINs have been rehashed with the new salt
 * (operator-driven rotation), this can be removed.
 */
export function computeLegacyLookupHash(cleanPinStr: string): string {
  if (!cleanPinStr) return '';
  return crypto.scryptSync(cleanPinStr, LEGACY_PIN_LOOKUP_SALT, 32).toString('hex');
}

/**
 * Returns true if the active salt differs from the legacy salt — i.e. the
 * operator has configured PIN_LOOKUP_SALT and new hashes are being
 * computed with the migrated salt. Useful for tests + migration tooling.
 */
export function isPinLookupSaltMigrated(): boolean {
  return resolveActiveSalt() !== LEGACY_PIN_LOOKUP_SALT;
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.toLowerCase());
  const bufB = Buffer.from(b.toLowerCase());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyScryptHash(inputCleanPin: string, scryptStr: string): boolean {
  try {
    const parts = scryptStr.split('$');
    if (parts.length >= 5 && parts[1] === 'scrypt') {
      const paramStr = parts[2];
      const saltHex = parts[3];
      const expectedHash = parts[4];
      const params: Record<string, number> = {};
      paramStr.split(',').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) params[k] = parseInt(v, 10);
      });
      const N = params.N || 16384;
      const r = params.r || 8;
      const p = params.p || 1;
      const salt = Buffer.from(saltHex, 'hex');
      const derived = crypto.scryptSync(inputCleanPin, salt, 32, { N, r, p }).toString('hex');
      return safeCompare(derived, expectedHash);
    }
  } catch (e) {
    console.error('[Server Auth] Error verifying scrypt hash:', e);
  }
  return false;
}

export function verifySingleFieldValue(inputCleanPin: string, storedVal: any): { matches: boolean; isLegacy: boolean } {
  if (!inputCleanPin || storedVal === undefined || storedVal === null) return { matches: false, isLegacy: false };
  const strVal = String(storedVal).trim();
  if (!strVal) return { matches: false, isLegacy: false };

  if (strVal.startsWith('$scrypt$') && verifyScryptHash(inputCleanPin, strVal)) {
    return { matches: true, isLegacy: false };
  }

  return { matches: false, isLegacy: false };
}

export function verifyPinMatch(inputCleanPin: string, storedPin: any): { matches: boolean; isLegacy: boolean } {
  return verifySingleFieldValue(inputCleanPin, storedPin);
}

export function verifyDocMatch(inputCleanPin: string, docData: any): { matches: boolean; isLegacy: boolean } {
  if (!docData) return { matches: false, isLegacy: false };
  const candidateFields = [docData.pin, docData.ownerPin, docData.adminPin, docData.pinLookupHash];
  for (const fieldVal of candidateFields) {
    const check = verifySingleFieldValue(inputCleanPin, fieldVal);
    if (check.matches) {
      return check;
    }
  }
  return { matches: false, isLegacy: false };
}
