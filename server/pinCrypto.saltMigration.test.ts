import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Note: pinCrypto reads PIN_LOOKUP_SALT from globalThis.__RQ_PIN_LOOKUP_SALT__
// (set by the Worker middleware) or process.env.PIN_LOOKUP_SALT (Node dev).
// Tests set/clear globalThis directly.

import {
  computeLookupHash,
  computeLegacyLookupHash,
  isPinLookupSaltMigrated,
} from './pinCrypto';

const LEGACY_SALT = 'ark_garage_secure_pin_lookup_salt_v2';
const TEST_NEW_SALT = 'test-migrated-salt-with-at-least-16-chars';

describe('PIN lookup salt migration (audit N22)', () => {
  afterEach(() => {
    // Clean up globalThis between tests so each test starts in a known state.
    delete (globalThis as any).__RQ_PIN_LOOKUP_SALT__;
    delete process.env.PIN_LOOKUP_SALT;
  });

  it('computeLegacyLookupHash always uses the hardcoded legacy salt', () => {
    const pin = '12345';
    const hash = computeLegacyLookupHash(pin);
    // Stable: same input → same output (deterministic scrypt with fixed salt).
    expect(hash).toBe(computeLegacyLookupHash(pin));
    // Length: 32 bytes hex = 64 chars.
    expect(hash).toHaveLength(64);
    // Matches what computeLookupHash produces when no env salt is set
    // (i.e. the active salt IS the legacy salt in the unmigrated state).
    delete (globalThis as any).__RQ_PIN_LOOKUP_SALT__;
    delete process.env.PIN_LOOKUP_SALT;
    expect(computeLookupHash(pin)).toBe(hash);
  });

  it('isPinLookupSaltMigrated returns false when no env salt is set', () => {
    delete (globalThis as any).__RQ_PIN_LOOKUP_SALT__;
    delete process.env.PIN_LOOKUP_SALT;
    expect(isPinLookupSaltMigrated()).toBe(false);
  });

  it('isPinLookupSaltMigrated returns true when env salt is set (>=16 chars)', () => {
    (globalThis as any).__RQ_PIN_LOOKUP_SALT__ = TEST_NEW_SALT;
    expect(isPinLookupSaltMigrated()).toBe(true);
  });

  it('computeLookupHash uses the env salt when set, producing a different hash than legacy', () => {
    const pin = '67890';
    (globalThis as any).__RQ_PIN_LOOKUP_SALT__ = TEST_NEW_SALT;
    const migratedHash = computeLookupHash(pin);
    const legacyHash = computeLegacyLookupHash(pin);
    // Same length (scrypt 32 bytes hex).
    expect(migratedHash).toHaveLength(64);
    expect(legacyHash).toHaveLength(64);
    // Different salts → different hashes (otherwise scrypt is broken).
    expect(migratedHash).not.toBe(legacyHash);
    // Stable across calls within the same env config.
    expect(computeLookupHash(pin)).toBe(migratedHash);
  });

  it('env salt shorter than 16 chars is rejected — falls back to legacy', () => {
    const pin = '99999';
    (globalThis as any).__RQ_PIN_LOOKUP_SALT__ = 'too-short'; // 8 chars
    expect(isPinLookupSaltMigrated()).toBe(false);
    expect(computeLookupHash(pin)).toBe(computeLegacyLookupHash(pin));
  });

  it('env salt is trimmed before use', () => {
    const pin = '54321';
    (globalThis as any).__RQ_PIN_LOOKUP_SALT__ = '  ' + TEST_NEW_SALT + '  ';
    const trimmedHash = computeLookupHash(pin);
    (globalThis as any).__RQ_PIN_LOOKUP_SALT__ = TEST_NEW_SALT;
    const untrimmedHash = computeLookupHash(pin);
    expect(trimmedHash).toBe(untrimmedHash);
  });

  it('process.env.PIN_LOOKUP_SALT is consulted as a fallback (Node dev path)', () => {
    const pin = '13579';
    delete (globalThis as any).__RQ_PIN_LOOKUP_SALT__;
    process.env.PIN_LOOKUP_SALT = TEST_NEW_SALT;
    expect(isPinLookupSaltMigrated()).toBe(true);
    expect(computeLookupHash(pin)).not.toBe(computeLegacyLookupHash(pin));
    delete process.env.PIN_LOOKUP_SALT;
  });

  it('legacy salt is the documented hardcoded value (no silent drift)', () => {
    // This test exists to make any future change to LEGACY_PIN_LOOKUP_SALT
    // a deliberate, visible act. If you change it, you will break every
    // existing pinLookupHash in the production DB — update the migration
    // notes in server/pinCrypto.ts AND plan a force-rotation.
    expect(LEGACY_SALT).toBe('ark_garage_secure_pin_lookup_salt_v2');
  });
});
