import { vi, describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import {
  IDEMPOTENCY_HEADER_NAME,
  IDEMPOTENCY_HEADER_NAME_ALT,
  extractIdempotencyKey,
  generateIdempotencyKey
} from '../types/apiContracts';
import { validateIdempotencyKey } from '../../server/validation';
import { idempotencyMiddleware } from '../../server/middleware';

describe('Phase 1 — Foundation & Routing Test Suite', () => {
  it('1. Verifies deployment configuration', () => {
    const wranglerPath = path.resolve(process.cwd(), 'wrangler.toml');
    expect(fs.existsSync(wranglerPath)).toBe(true);
    const content = fs.readFileSync(wranglerPath, 'utf-8');
    expect(content).toContain('name = "rq"');
    expect(content).toContain('main = "server/cloudflareWorker.ts"');
  });

  it('2. Verifies the active Cloudflare Worker entry source exists', () => {
    const apiEntryPath = path.resolve(process.cwd(), 'server/cloudflareWorker.ts');
    expect(fs.existsSync(apiEntryPath)).toBe(true);
    expect(fs.readFileSync(apiEntryPath, 'utf8')).toContain("from 'hono'");
  });

  it('3. Verifies shared idempotency key transport helper', () => {
    expect(IDEMPOTENCY_HEADER_NAME).toBe('x-idempotency-key');
    expect(IDEMPOTENCY_HEADER_NAME_ALT).toBe('idempotency-key');

    // Header extraction
    expect(extractIdempotencyKey({ 'x-idempotency-key': 'test-key-12345' })).toBe('test-key-12345');
    expect(extractIdempotencyKey({ 'idempotency-key': 'test-alt-key-12345' })).toBe('test-alt-key-12345');
    expect(extractIdempotencyKey({})).toBeNull();
    expect(extractIdempotencyKey(null as any)).toBeNull();

    // Key generator
    const genKey = generateIdempotencyKey('veh_checkin');
    expect(genKey.startsWith('veh_checkin_')).toBe(true);
    expect(genKey.length).toBeGreaterThan(16);
  });

  it('4. Verifies idempotency key format validator', () => {
    expect(validateIdempotencyKey(null)).toBeNull();
    expect(validateIdempotencyKey('')).toBeNull();

    // Valid keys
    expect(validateIdempotencyKey('valid_key_12345678')).toBe('valid_key_12345678');
    expect(validateIdempotencyKey('uuid-1234-5678-90ab-cdef')).toBe('uuid-1234-5678-90ab-cdef');

    // Invalid length (<8 or >128)
    expect(() => validateIdempotencyKey('short')).toThrowError(/between 8 and 128/);
    expect(() => validateIdempotencyKey('a'.repeat(129))).toThrowError(/between 8 and 128/);

    // Invalid characters (spaces, punctuation, symbols)
    expect(() => validateIdempotencyKey('invalid key with spaces')).toThrowError(/invalid characters/);
    expect(() => validateIdempotencyKey('invalid$key!symbols')).toThrowError(/invalid characters/);
  });

  it('5. Verifies idempotencyMiddleware behavior', () => {
    const middlewareRequired = idempotencyMiddleware(true);
    const middlewareOptional = idempotencyMiddleware(false);

    // Missing key when required -> 400
    let statusCode = 200;
    let jsonBody: any = null;
    let nextCalled = false;

    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      }
    } as any;

    const mockReqEmpty = {
      headers: {},
      body: {}
    } as any;

    middlewareRequired(mockReqEmpty, mockRes, () => { nextCalled = true; });
    expect(statusCode).toBe(400);
    expect(jsonBody?.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(nextCalled).toBe(false);

    // Missing key when optional -> next()
    nextCalled = false;
    statusCode = 200;
    middlewareOptional(mockReqEmpty, mockRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(statusCode).toBe(200);

    // Valid key in header -> attaches req.idempotencyKey
    const mockReqValid = {
      headers: { 'x-idempotency-key': 'valid_key_123456' },
      body: {}
    } as any;

    nextCalled = false;
    middlewareOptional(mockReqValid, mockRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(mockReqValid.idempotencyKey).toBe('valid_key_123456');
  });
});
