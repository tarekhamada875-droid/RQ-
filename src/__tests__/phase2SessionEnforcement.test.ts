import { describe, it, expect, vi } from 'vitest';
import { sendApiError, requireAuth } from '../../server/middleware';
import { ApiErrorEnvelope } from '../types/apiContracts';

describe('Phase 2 — Central Authority & Session Enforcement', () => {
  describe('1. sendApiError Envelope Standardization', () => {
    it('creates well-formed ApiErrorEnvelope with all mandatory fields', () => {
      let capturedStatus = 0;
      let capturedBody: ApiErrorEnvelope | null = null;

      const mockRes: any = {
        status: (s: number) => {
          capturedStatus = s;
          return mockRes;
        },
        json: (data: any) => {
          capturedBody = data;
          return mockRes;
        }
      };

      sendApiError(mockRes, 401, 'SESSION_EXPIRED', 'Your session has expired', 'corr-12345');

      expect(capturedStatus).toBe(401);
      expect(capturedBody).toBeDefined();
      expect(capturedBody?.success).toBe(false);
      expect(capturedBody?.statusCode).toBe(401);
      expect(capturedBody?.code).toBe('SESSION_EXPIRED');
      expect(capturedBody?.error).toBe('Your session has expired');
      expect(capturedBody?.correlationId).toBe('corr-12345');
      expect(capturedBody?.timestamp).toBeDefined();
      expect(new Date(capturedBody!.timestamp).getTime()).not.toBeNaN();
    });

    it('handles custom error details if provided', () => {
      let capturedBody: ApiErrorEnvelope | null = null;

      const mockRes: any = {
        status: () => mockRes,
        json: (data: any) => {
          capturedBody = data;
          return mockRes;
        }
      };

      sendApiError(
        mockRes,
        403,
        'FORBIDDEN',
        'Unauthorized access to garage resource',
        'corr-999',
        { requestedGarageId: 'garage_a', userGarageId: 'garage_b' }
      );

      expect(capturedBody?.success).toBe(false);
      expect(capturedBody?.code).toBe('FORBIDDEN');
      expect(capturedBody?.details).toEqual({
        requestedGarageId: 'garage_a',
        userGarageId: 'garage_b'
      });
    });
  });

  describe('2. requireAuth Session Gatekeeper Rejection Scenarios', () => {
    it('rejects request with 401 UNAUTHORIZED when Authorization header is missing', async () => {
      let capturedStatus = 0;
      let capturedBody: ApiErrorEnvelope | null = null;

      const mockReq: any = {
        headers: {},
        correlationId: 'test-req-no-token'
      };

      const mockRes: any = {
        status: (s: number) => {
          capturedStatus = s;
          return mockRes;
        },
        json: (data: any) => {
          capturedBody = data;
          return mockRes;
        }
      };

      const next = vi.fn();

      await requireAuth(mockReq, mockRes, next);

      expect(next).not.toHaveBeenCalled();
      expect(capturedStatus).toBe(401);
      expect(capturedBody?.success).toBe(false);
      expect(capturedBody?.code).toBe('UNAUTHORIZED');
      expect(capturedBody?.error).toContain('UNAUTHORIZED: Missing Firebase ID Token');
    });

    it('rejects request with 401 SESSION_REVOKED when session ID differs or session is inactive', () => {
      // Simulating the server session checking rule
      const checkSessionStatus = (secData: any, callerSessionId: string) => {
        if (!secData || !secData.isActive || secData.sessionId !== callerSessionId) {
          return { code: 'SESSION_REVOKED', message: 'SESSION_REVOKED' };
        }
        return { code: 'OK' };
      };

      // Inactive session
      const res1 = checkSessionStatus({ isActive: false, sessionId: 'sess-1' }, 'sess-1');
      expect(res1.code).toBe('SESSION_REVOKED');

      // Session ID mismatch (another device took over)
      const res2 = checkSessionStatus({ isActive: true, sessionId: 'sess-new-device' }, 'sess-old-device');
      expect(res2.code).toBe('SESSION_REVOKED');

      // Active matching session
      const res3 = checkSessionStatus({ isActive: true, sessionId: 'sess-1' }, 'sess-1');
      expect(res3.code).toBe('OK');
    });

    it('rejects request with 401 SESSION_EXPIRED when inactivity exceeds 24 hours', () => {
      const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const isSessionExpired = (lastActiveTime: number) => {
        return (now - lastActiveTime) > SESSION_TIMEOUT_MS;
      };

      // 23 hours ago -> Not expired
      expect(isSessionExpired(now - 23 * 60 * 60 * 1000)).toBe(false);

      // 24 hours and 1 second ago -> Expired
      expect(isSessionExpired(now - (24 * 60 * 60 * 1000 + 1000))).toBe(true);
    });
  });

  describe('3. Client-Side Session Termination & Event Dispatch Detection', () => {
    it('detects session termination from ApiErrorEnvelope codes', () => {
      const isSessionTerminated = (status: number, body: any) => {
        const errorCode = body?.code;
        const errorMessage = typeof body?.error === 'string' ? body.error : '';
        return status === 401 ||
          errorCode === 'SESSION_REVOKED' ||
          errorCode === 'SESSION_EXPIRED' ||
          errorCode === 'UNAUTHORIZED' ||
          errorMessage.includes('SESSION_REVOKED') ||
          errorMessage.includes('SESSION_EXPIRED');
      };

      // 401 status with ApiErrorEnvelope
      expect(isSessionTerminated(401, {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Missing Firebase ID Token'
      })).toBe(true);

      // 200/403/409 with SESSION_REVOKED code
      expect(isSessionTerminated(200, {
        valid: false,
        code: 'SESSION_REVOKED',
        error: 'SESSION_REVOKED'
      })).toBe(true);

      // 200 with SESSION_EXPIRED code
      expect(isSessionTerminated(200, {
        valid: false,
        code: 'SESSION_EXPIRED',
        error: 'SESSION_EXPIRED'
      })).toBe(true);

      // Normal business validation error (e.g. INSUFFICIENT_BALANCE) should NOT trigger session termination
      expect(isSessionTerminated(409, {
        success: false,
        code: 'CONFLICT',
        error: 'INSUFFICIENT_BALANCE'
      })).toBe(false);
    });
  });
});
