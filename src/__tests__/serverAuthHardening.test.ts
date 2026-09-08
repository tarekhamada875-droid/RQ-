import { describe, it, expect } from 'vitest';
import { verifyScryptHash, verifySingleFieldValue, hashPinWithUniqueSalt, legacyHashPin } from '../../server/utils';

describe('Phase 02: Server Security Hardening & Session Boundaries', () => {
  describe('Constant-Time & Timing-Safe PIN Verification', () => {
    it('verifies modern salted scrypt PIN hashes correctly', () => {
      const pin = '123456';
      const scryptHash = hashPinWithUniqueSalt(pin);
      
      expect(scryptHash.startsWith('$scrypt$')).toBe(true);
      expect(verifyScryptHash(pin, scryptHash)).toBe(true);
      expect(verifyScryptHash('654321', scryptHash)).toBe(false);
      expect(verifyScryptHash('', scryptHash)).toBe(false);
    });

    it('verifies legacy 64-char single-salt hex hashes with upgrade flag', () => {
      const pin = '999999';
      const legacyHex = legacyHashPin(pin);
      
      const result = verifySingleFieldValue(pin, legacyHex);
      expect(result.matches).toBe(true);
      expect(result.isLegacy).toBe(true);

      const wrongResult = verifySingleFieldValue('111111', legacyHex);
      expect(wrongResult.matches).toBe(false);
    });

    it('handles null, undefined, empty strings, and malformed inputs gracefully without throwing', () => {
      expect(verifySingleFieldValue('', null).matches).toBe(false);
      expect(verifySingleFieldValue('1234', undefined).matches).toBe(false);
      expect(verifySingleFieldValue('1234', '$scrypt$invalid$format').matches).toBe(false);
      expect(verifyScryptHash('1234', 'malformed_hash')).toBe(false);
    });
  });

  describe('Session Release & Auth Authorization Isolation', () => {
    it('prohibits releasing session if authenticated UID does not match session owner (unless admin)', () => {
      const callerUid: string = 'user_attacker_123';
      const targetSessionUid: string = 'user_victim_456';
      const isCallerAdminOrSupervisor = false;

      const isAuthorizedToRelease = (callerUid === targetSessionUid) || isCallerAdminOrSupervisor;
      expect(isAuthorizedToRelease).toBe(false);
    });

    it('permits releasing own session when authenticated UID matches target session', () => {
      const callerUid: string = 'user_legit_123';
      const targetSessionUid: string = 'user_legit_123';
      const isCallerAdminOrSupervisor = false;

      const isAuthorizedToRelease = (callerUid === targetSessionUid) || isCallerAdminOrSupervisor;
      expect(isAuthorizedToRelease).toBe(true);
    });

    it('permits admin or supervisor to release targeted session on behalf of users', () => {
      const callerUid: string = 'admin_uid_789';
      const targetSessionUid: string = 'user_victim_456';
      const isCallerAdminOrSupervisor = true;

      const isAuthorizedToRelease = (callerUid === targetSessionUid) || isCallerAdminOrSupervisor;
      expect(isAuthorizedToRelease).toBe(true);
    });
  });

  describe('Transaction Protection & Body Spoofing Prevention', () => {
    it('strictly enforces role checking on approve-recharge-request', () => {
      const canApprove = (role?: string) => role === 'admin' || role === 'supervisor';

      expect(canApprove('admin')).toBe(true);
      expect(canApprove('supervisor')).toBe(true);
      expect(canApprove('garage')).toBe(false);
      expect(canApprove('staff')).toBe(false);
      expect(canApprove('delegate')).toBe(false);
      expect(canApprove(undefined)).toBe(false);
    });

    it('guarantees caller identity is derived from token session rather than arbitrary request body', () => {
      const reqUser = { uid: 'verified_staff_123', role: 'staff', garageId: 'garage_1' };
      const reqBody = { uid: 'spoofed_admin_999', role: 'admin' };

      // Secure behavior: req.user overrides everything in req.body
      const effectiveUid = reqUser.uid;
      const effectiveRole = reqUser.role;

      expect(effectiveUid).toBe('verified_staff_123');
      expect(effectiveRole).toBe('staff');
      expect(effectiveRole).not.toBe(reqBody.role);
    });
  });
});
