/**
 * RQ Debug Recorder — the app's "black box".
 *
 * Owner request (2026-11-17): "debugging on literally everything". While this
 * instrumentation is active, every API call, global error, Firestore listener
 * registration, navigation and environment change is recorded into an
 * in-memory ring buffer that is periodically mirrored to localStorage. The
 * owner can then download one JSON debug file from the on-screen button and
 * hand it back for audit (correctness, wiring, latency, payload bloat).
 *
 * PRIVACY (docs/SECURITY.md): the debug file leaves the device, so customer
 * PII must never be recorded. The sanitizer below keeps the STRUCTURE of
 * payloads (field names, types, sizes — exactly what a payload audit needs)
 * but redacts string values except for safe technical tokens (ids, enum
 * codes, ISO dates). Names, phones, notes, plates, tokens, PINs are replaced
 * by `«str:N»` placeholders where N is the string length in chars.
 *
 * COST: recording is O(1) per event plus one bounded sanitize pass per API
 * call; the buffer is capped at MAX_ENTRIES and localStorage mirrors only the
 * most recent LS_FLUSH_KEEP entries, throttled.
 */

export type DebugCategory = 'api' | 'error' | 'listener' | 'nav' | 'env' | 'note';

export interface DebugEntry {
  seq: number;
  t: string;
  cat: DebugCategory;
  [key: string]: unknown;
}

export interface ApiBeginInput {
  method: string;
  endpoint: string;
  uid?: string | null;
  bodyString?: string;
}

interface ApiPatch {
  status?: number;
  ok?: boolean;
  clientMs?: number;
  ttfbMs?: number;
  parseMs?: number;
  serverMs?: number | null;
  reqBytes?: number | null;
  resBytes?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  correlationId?: string | null;
  resFields?: unknown;
}

const MAX_ENTRIES = 1200;
const LS_KEY = 'rq_debug_recorder_v1';
const LS_FLUSH_KEEP = 400;
const LS_FLUSH_INTERVAL_MS = 30_000;
const MAX_VALUE_STR = 64;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;
const MAX_SAMPLE_ITEMS = 3;
const MAX_BODY_STRING_FOR_PARSE = 64 * 1024;

// Keys whose values are NEVER kept regardless of shape.
const FORBIDDEN_KEY_RE = /token|pin|password|secret|salt|authorization|cookie|firebaseidtoken/i;
// Keys whose string VALUES are personal data even if they look technically
// safe (a phone number is just digits; a name is a short string).
const PII_KEY_RE = /phone|mobile|whatsapp|name|email|address|notes?|plate|letters|numbers|customer|driver|subscriber|owner|display/i;

const SAFE_STRING_RE = /^[A-Za-z0-9_.:\-/@+]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

function redactedString(value: string): string {
  return `«str:${value.length}»`;
}

/**
 * PII-safe structural clone: keeps numbers/booleans/null, keeps field names,
 * keeps only whitelisted string values (ids, codes, dates), redacts the rest.
 */
export function sanitizeValue(value: unknown, depth = 0, key = ''): unknown {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === 'number' || type === 'boolean') return value;
  if (type === 'string') {
    const s = value as string;
    if (FORBIDDEN_KEY_RE.test(key) || PII_KEY_RE.test(key)) return redactedString(s);
    if (s.length <= MAX_VALUE_STR && SAFE_STRING_RE.test(s)) return s;
    if (ISO_DATE_RE.test(s)) return s;
    return redactedString(s);
  }
  if (type !== 'object') return redactedString(String(value));
  if (depth >= MAX_DEPTH) return '«maxdepth»';

  if (Array.isArray(value)) {
    const sample = value.slice(0, MAX_SAMPLE_ITEMS).map((item) => sanitizeValue(item, depth + 1, key));
    return { len: value.length, sample };
  }

  const out: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  for (const [k, v] of entries) {
    out[k] = sanitizeValue(v, depth + 1, k);
  }
  return out;
}

class DebugRecorder {
  private entries: DebugEntry[] = [];
  private seq = 0;
  private startedAt = new Date().toISOString();
  private initialized = false;
  private lastFlushAt = 0;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.startedAt = new Date().toISOString();

    window.addEventListener('error', (event) => {
      this.record('error', {
        ev: 'window_error',
        msg: String(event.message || '').slice(0, 300),
        src: event.filename || null,
        line: event.lineno ?? null,
        col: event.colno ?? null,
        stack: event.error instanceof Error ? String(event.error.stack || '').slice(0, 500) : null,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.record('error', {
        ev: 'unhandled_rejection',
        msg: String(reason instanceof Error ? reason.message : reason).slice(0, 300),
        stack: reason instanceof Error ? String(reason.stack || '').slice(0, 500) : null,
      });
    });

    window.addEventListener('online', () => this.record('env', { ev: 'online' }));
    window.addEventListener('offline', () => this.record('env', { ev: 'offline' }));

    document.addEventListener('visibilitychange', () => {
      this.record('env', { ev: 'visibility', visible: document.visibilityState === 'visible' });
    });

    window.addEventListener('hashchange', () => {
      this.record('nav', { ev: 'hashchange', hash: window.location.hash || '(none)' });
    });

    window.addEventListener('pagehide', () => this.flush(true));

    this.record('env', { ev: 'boot', ...this.collectEnvMeta() });
    this.restoreFromLocalStorage();
  }

  private collectEnvMeta(): Record<string, unknown> {
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      deviceMemory?: number;
    };
    const conn = nav.connection;
    return {
      url: window.location.href.slice(0, 200),
      userAgent: nav.userAgent.slice(0, 200),
      language: nav.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio ?? null,
      online: nav.onLine,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? null,
      deviceMemoryGb: nav.deviceMemory ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sessionId: localStorage.getItem('rq_canonical_session_id') || localStorage.getItem('app_session_id') || null,
    };
  }

  record(cat: DebugCategory, data: Record<string, unknown>): void {
    this.seq += 1;
    const entry: DebugEntry = {
      seq: this.seq,
      t: new Date().toISOString(),
      cat,
      ...data,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.flushThrottled();
  }

  /**
   * API flow: push a pending entry at request start, patch it when it
   * settles. A pending entry that is never patched is itself a finding
   * (request that never completed before export).
   */
  apiBegin(input: ApiBeginInput): number {
    let reqFields: unknown = null;
    if (input.bodyString && input.bodyString.length <= MAX_BODY_STRING_FOR_PARSE) {
      try {
        reqFields = sanitizeValue(JSON.parse(input.bodyString));
      } catch {
        reqFields = { unparsed: true, chars: input.bodyString.length };
      }
    } else if (input.bodyString) {
      reqFields = { tooLargeChars: input.bodyString.length };
    }
    this.seq += 1;
    const entry: DebugEntry = {
      seq: this.seq,
      t: new Date().toISOString(),
      cat: 'api',
      m: input.method,
      ep: input.endpoint,
      uid: input.uid || null,
      pending: true,
      reqFields,
    };
    if (input.bodyString) entry.reqBytes = input.bodyString.length;
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    return this.seq;
  }

  apiEnd(seq: number, patch: ApiPatch): void {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      if (entry.seq === seq && entry.cat === 'api') {
        Object.assign(entry, patch);
        entry.pending = false;
        return;
      }
    }
    // Entry may have been evicted by the ring buffer cap; keep a trace.
    this.record('note', {
      ev: 'api_end_orphan',
      seq,
      patch: sanitizeValue(patch),
    });
  }

  get count(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.seq = 0;
    this.startedAt = new Date().toISOString();
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // storage unavailable — ignore
    }
    this.record('env', { ev: 'cleared' });
  }

  /** Human-readable one-screen summary for clipboard sharing. */
  getSummary(): string {
    const apiEntries = this.entries.filter((e) => e.cat === 'api');
    const slowest = [...apiEntries]
      .filter((e) => typeof e.clientMs === 'number')
      .sort((a, b) => (b.clientMs as number) - (a.clientMs as number))
      .slice(0, 10)
      .map((e) => `${e.m} ${e.ep} → ${e.status ?? '??'} in ${Math.round(e.clientMs as number)}ms (srv ${e.serverMs ?? '?'})`);
    const errors = this.entries.filter((e) => e.cat === 'error');
    const failed = apiEntries.filter((e) => e.ok === false || (typeof e.status === 'number' && e.status >= 400));
    const pending = apiEntries.filter((e) => e.pending);
    return [
      `RQ Debug Summary (${this.entries.length} events, since ${this.startedAt})`,
      `API calls: ${apiEntries.length} | failed: ${failed.length} | still-pending: ${pending.length} | JS errors: ${errors.length}`,
      slowest.length ? `Slowest:\n  ${slowest.join('\n  ')}` : '',
    ].filter(Boolean).join('\n');
  }

  exportJson(): string {
    const apiEntries = this.entries.filter((e) => e.cat === 'api');
    const durations = apiEntries
      .map((e) => (typeof e.clientMs === 'number' ? (e.clientMs as number) : 0))
      .sort((a, b) => a - b);
    const pick = (p: number): number | null => (durations.length ? Math.round(durations[Math.min(durations.length - 1, Math.floor(p * durations.length))]) : null);
    return JSON.stringify({
      meta: {
        app: 'RQ debug recorder v1',
        exportedAt: new Date().toISOString(),
        startedAt: this.startedAt,
        events: this.entries.length,
        apiCalls: apiEntries.length,
        apiClientMsP50: pick(0.5),
        apiClientMsP90: pick(0.9),
        apiClientMsP99: pick(0.99),
        ...this.collectEnvMeta(),
      },
      entries: this.entries,
    }, null, 1);
  }

  download(): void {
    const blob = new Blob([this.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `rq-debug-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    this.record('env', { ev: 'debug_file_exported', events: this.entries.length });
  }

  private flushThrottled(): void {
    const now = Date.now();
    if (now - this.lastFlushAt < LS_FLUSH_INTERVAL_MS) return;
    this.flush(false);
  }

  private flush(force: boolean): void {
    if (!force && Date.now() - this.lastFlushAt < LS_FLUSH_INTERVAL_MS) return;
    this.lastFlushAt = Date.now();
    try {
      const tail = this.entries.slice(-LS_FLUSH_KEEP);
      localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: new Date().toISOString(), entries: tail }));
    } catch {
      // Quota exceeded or storage disabled — in-memory buffer still works.
    }
  }

  private restoreFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: string; entries?: DebugEntry[] };
      const restored = Array.isArray(parsed.entries) ? parsed.entries : [];
      if (!restored.length) return;
      const maxSeq = restored.reduce((acc, e) => Math.max(acc, Number(e.seq) || 0), 0);
      this.seq = maxSeq;
      this.entries = [...restored, ...this.entries];
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.splice(0, this.entries.length - MAX_ENTRIES);
      }
      this.record('env', { ev: 'restored_from_storage', restored: restored.length, savedAt: parsed.savedAt || null });
    } catch {
      // Corrupt debug cache — ignore, do not disturb the app.
    }
  }
}

export const debugRecorder = new DebugRecorder();
