import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sanitizeValue, debugRecorder } from './debugRecorder';

describe('sanitizeValue (PII-safe structural snapshot)', () => {
  it('keeps numbers, booleans and null untouched', () => {
    expect(sanitizeValue({ count: 3, active: true, missing: null })).toEqual({
      count: 3,
      active: true,
      missing: null,
    });
  });

  it('redacts long or unsafe string values but records their length', () => {
    const out = sanitizeValue({ name: 'محمد أحمد علي حسن', phone: '01012345678' }) as Record<string, string>;
    expect(out.name).toBe('«str:17»');
    expect(out.phone).toBe('«str:11»');
    expect(JSON.stringify(out)).not.toContain('محمد');
    expect(JSON.stringify(out)).not.toContain('01012345678');
  });

  it('never records values under forbidden keys (tokens, PINs, secrets)', () => {
    const out = sanitizeValue({ idToken: 'abc.def.ghi', pin: '12345', password: 'hunter2' }) as Record<string, string>;
    expect(out.idToken).toBe('«str:11»');
    expect(out.pin).toBe('«str:5»');
    expect(out.password).toBe('«str:7»');
    expect(JSON.stringify(out)).not.toContain('hunter2');
  });

  it('keeps safe technical strings: ids, enum codes, ISO dates, correlation ids', () => {
    const out = sanitizeValue({
      id: 'uid_abc-123',
      code: 'SESSION_REVOKED',
      createdAt: '2026-11-17T09:30:00Z',
      correlationId: 'c1d2e3',
    }) as Record<string, string>;
    expect(out.id).toBe('uid_abc-123');
    expect(out.code).toBe('SESSION_REVOKED');
    expect(out.createdAt).toBe('2026-11-17T09:30:00Z');
    expect(out.correlationId).toBe('c1d2e3');
  });

  it('caps array sampling with an honest total length', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, name: `اسم ${i}` }));
    const out = sanitizeValue({ items }) as { items: { len: number; sample: Array<Record<string, string>> } };
    expect(out.items.len).toBe(7);
    expect(out.items.sample).toHaveLength(3);
    expect(out.items.sample[0].id).toBe('s0');
    expect(out.items.sample[0].name).toBe('«str:5»');
  });

  it('caps depth and object key count', () => {
    const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
    expect(sanitizeValue(deep)).toEqual({ a: { b: { c: { d: '«maxdepth»' } } } });
    const wide: Record<string, number> = {};
    for (let i = 0; i < 70; i += 1) wide[`k${i}`] = i;
    const outWide = sanitizeValue(wide) as Record<string, number>;
    expect(Object.keys(outWide).length).toBe(60);
  });

  it('AUDIT FIX 2026-11-17: redacts singular *Number keys (wallet number leak)', () => {
    // The owner's exported file contained paymentWalletNumber verbatim because
    // the PII key pattern only matched plural `numbers`.
    const out = sanitizeValue({ paymentWalletNumber: '01552411323', creditRate: 2 }) as Record<string, unknown>;
    expect(out.paymentWalletNumber).toBe('«str:11»');
    expect(out.creditRate).toBe(2);
    expect(JSON.stringify(out)).not.toContain('01552411323');
  });

  it('AUDIT FIX 2026-11-17: init restores old entries BEFORE recording boot (no duplicate boot)', () => {
    debugRecorder.resetForTests();
    // Simulate a previous page load that persisted one entry.
    const previous = [{
      seq: 7,
      t: '2026-11-17T06:00:00.000Z',
      cat: 'note',
      ev: 'from_previous_load',
    }];
    localStorage.setItem('rq_debug_recorder_v1', JSON.stringify({ savedAt: '2026-11-17T06:00:01.000Z', entries: previous }));

    debugRecorder.init();
    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const boots = exported.entries.filter((e) => e.ev === 'boot');
    // Exactly one boot entry; seq continues after the restored entry (7) and
    // the restore marker (8).
    expect(boots).toHaveLength(1);
    expect(boots[0].seq).toBe(9);
    expect(exported.entries[0].ev).toBe('from_previous_load');
    const restoredCount = exported.entries.filter((e) => e.ev === 'from_previous_load').length;
    expect(restoredCount).toBe(1);
    debugRecorder.resetForTests();
  });
});

describe('debugRecorder api entries', () => {
  beforeEach(() => {
    debugRecorder.clear();
  });

  it('apiBegin creates a pending entry and apiEnd settles it with timings', () => {
    const seq = debugRecorder.apiBegin({
      method: 'POST',
      endpoint: '/api/vehicles/check-in',
      uid: 'uid_x',
      bodyString: JSON.stringify({ plateNumbers: '123', plateLetters: 'س ل ب', garageId: 'g1', driverPhone: '01098765432' }),
    });

    const pending = debugRecorder.exportJson();
    expect(pending).toContain('"pending": true');

    debugRecorder.apiEnd(seq, {
      status: 200,
      ok: true,
      clientMs: 123.4,
      ttfbMs: 100.1,
      parseMs: 2.2,
      serverMs: 80,
      resBytes: 456,
      correlationId: 'corr-1',
      resFields: sanitizeValue({ success: true, data: { plateLetters: 'س ل ب' } }),
    });

    const exported = JSON.parse(debugRecorder.exportJson()) as {
      meta: Record<string, unknown>;
      entries: Array<Record<string, unknown>>;
    };

    expect(exported.meta.apiCalls).toBe(1);
    expect(exported.meta.apiClientMsP50).toBe(123);
    const entry = exported.entries.find((e) => e.seq === seq) as Record<string, unknown>;
    expect(entry.pending).toBe(false);
    expect(entry.m).toBe('POST');
    expect(entry.ep).toBe('/api/vehicles/check-in');
    expect(entry.clientMs).toBeCloseTo(123.4, 1);
    expect(entry.serverMs).toBe(80);
    expect((entry.resFields as Record<string, unknown>).success).toBe(true);
    // PII from the request body must not survive into the file.
    expect(debugRecorder.exportJson()).not.toContain('01098765432');
    expect(debugRecorder.exportJson()).not.toContain('س ل ب');
  });

  it('failed calls keep error code and message but no PII payload', () => {
    const seq = debugRecorder.apiBegin({ method: 'GET', endpoint: '/api/garage/summary' });
    debugRecorder.apiEnd(seq, {
      status: 403,
      ok: false,
      clientMs: 45,
      errorCode: 'FORBIDDEN',
      errorMessage: 'scope denied',
    });
    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const entry = exported.entries.find((e) => e.cat === 'api') as Record<string, unknown>;
    expect(entry.ok).toBe(false);
    expect(entry.errorCode).toBe('FORBIDDEN');
    expect(entry.pending).toBe(false);
  });

  it('ring buffer drops the oldest entries past the cap', () => {
    for (let i = 0; i < 1300; i += 1) {
      debugRecorder.record('note', { i });
    }
    const exported = JSON.parse(debugRecorder.exportJson()) as { meta: { events: number } };
    expect(exported.meta.events).toBeLessThanOrEqual(1200);
  });
});

describe('debugRecorder summary and hygiene', () => {
  beforeEach(() => {
    debugRecorder.clear();
  });

  it('getSummary lists slowest calls and counts errors', () => {
    const a = debugRecorder.apiBegin({ method: 'GET', endpoint: '/api/slow' });
    debugRecorder.apiEnd(a, { status: 200, ok: true, clientMs: 900, serverMs: 850 });
    const b = debugRecorder.apiBegin({ method: 'POST', endpoint: '/api/boom' });
    debugRecorder.apiEnd(b, { status: 500, ok: false, clientMs: 30, errorCode: 'INTERNAL_SERVER_ERROR' });
    debugRecorder.record('error', { ev: 'window_error', msg: 'boom' });

    const summary = debugRecorder.getSummary();
    expect(summary).toContain('API calls: 2');
    expect(summary).toContain('failed: 1');
    expect(summary).toContain('JS errors: 1');
    expect(summary).toContain('/api/slow');
    expect(summary).toContain('900ms');
  });

  it('clear resets the buffer and seq', () => {
    debugRecorder.record('note', { i: 1 });
    debugRecorder.clear();
    expect(debugRecorder.count).toBe(1); // only the 'cleared' marker
    const exported = JSON.parse(debugRecorder.exportJson()) as { meta: { events: number } };
    expect(exported.meta.events).toBe(1);
  });
});

// AUDIT EXTENSION (2026-11-19): auth + session helpers cover the Firebase
// Auth + session-coordinator pipeline that lives outside apiFetch. A hung
// login previously produced a debug file with 0 API calls + 0 errors + 0
// auth/session events — no signal at all. These tests pin the contract:
// events land in the right category, msSinceBoot is stamped so the gap
// between *_begin and the next event is the actual hang duration, and
// getSummary surfaces them so a clipboard-share shows the hang too.
describe('debugRecorder auth + session helpers (audit extension)', () => {
  beforeEach(() => {
    debugRecorder.clear();
  });

  it('authEvent emits a cat=auth entry with ev, msSinceBoot and passthrough fields', () => {
    debugRecorder.authEvent('auth_state_changed', { userPresent: true, isAnonymous: false, uid: 'uid_abc' });
    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const entry = exported.entries.find((e) => e.cat === 'auth');
    expect(entry).toBeDefined();
    expect(entry!.ev).toBe('auth_state_changed');
    expect(entry!.userPresent).toBe(true);
    expect(entry!.isAnonymous).toBe(false);
    expect(entry!.uid).toBe('uid_abc');
    expect(typeof entry!.msSinceBoot).toBe('number');
    expect(entry!.msSinceBoot).toBeGreaterThanOrEqual(0);
  });

  it('sessionEvent emits a cat=session entry with ev, msSinceBoot and passthrough fields', () => {
    debugRecorder.sessionEvent('coordinator_stuck', { view: 'garage', hasStoredGarage: true, hasCurrentUser: false });
    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const entry = exported.entries.find((e) => e.cat === 'session');
    expect(entry).toBeDefined();
    expect(entry!.ev).toBe('coordinator_stuck');
    expect(entry!.view).toBe('garage');
    expect(entry!.hasStoredGarage).toBe(true);
    expect(entry!.hasCurrentUser).toBe(false);
    expect(typeof entry!.msSinceBoot).toBe('number');
  });

  it('authEvent and sessionEvent land in distinct categories', () => {
    debugRecorder.authEvent('signin_anon_begin');
    debugRecorder.sessionEvent('coordinator_start');
    debugRecorder.authEvent('signin_anon_success', { ms: 320 });
    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const authEvents = exported.entries.filter((e) => e.cat === 'auth');
    const sessionEvents = exported.entries.filter((e) => e.cat === 'session');
    expect(authEvents).toHaveLength(2);
    expect(sessionEvents).toHaveLength(1);
    expect(authEvents[0].ev).toBe('signin_anon_begin');
    expect(authEvents[1].ev).toBe('signin_anon_success');
  });

  it('getSummary surfaces auth + session event counts and phase names', () => {
    debugRecorder.authEvent('signin_anon_begin');
    debugRecorder.authEvent('signin_anon_success', { ms: 250 });
    debugRecorder.sessionEvent('coordinator_start');
    debugRecorder.sessionEvent('coordinator_claim_attempt', { role: 'garage' });

    const summary = debugRecorder.getSummary();
    expect(summary).toContain('Auth events: 2');
    expect(summary).toContain('signin_anon_begin, signin_anon_success');
    expect(summary).toContain('Session events: 2');
    expect(summary).toContain('coordinator_start, coordinator_claim_attempt');
  });

  it('a hang shows up as begin with no matching success — the core regression this extension fixes', () => {
    // Simulates the owner's login-hang incident: the recorder saw begin
    // but no success. The debug file should preserve the begin event so
    // the auditor can see exactly where the hang is.
    debugRecorder.authEvent('signin_anon_begin');
    debugRecorder.sessionEvent('coordinator_start', { view: 'garage' });
    debugRecorder.sessionEvent('coordinator_signin_attempt');

    const exported = JSON.parse(debugRecorder.exportJson()) as { entries: Array<Record<string, unknown>> };
    const authEvents = exported.entries.filter((e) => e.cat === 'auth');
    const sessionEvents = exported.entries.filter((e) => e.cat === 'session');
    expect(authEvents).toHaveLength(1);
    expect(authEvents[0].ev).toBe('signin_anon_begin');
    expect(sessionEvents.map((e) => e.ev)).toEqual(['coordinator_start', 'coordinator_signin_attempt']);
    // No success or error events — the hang signature.
    expect(authEvents.find((e) => e.ev === 'signin_anon_success')).toBeUndefined();
    expect(authEvents.find((e) => e.ev === 'signin_anon_error')).toBeUndefined();
    expect(sessionEvents.find((e) => e.ev === 'coordinator_signin_done')).toBeUndefined();
    expect(sessionEvents.find((e) => e.ev === 'coordinator_signin_error')).toBeUndefined();
  });
});

afterEach(() => {
  // Keep tests isolated from persisted state.
  try {
    localStorage.removeItem('rq_debug_recorder_v1');
  } catch {
    // ignore
  }
});
