import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminAuth, adminDb, FieldValue, initializeFirebaseAdmin } from './firebaseWorkerAdmin';

/**
 * CONTRACT TEST — the production REST client must implement everything the
 * routes use.
 *
 * Why this test exists (full-codebase audit, 2026-11-21): the production
 * build (tools/build-cloudflare.mjs) aliases './firebaseAdmin' →
 * './firebaseWorkerAdmin'. Dev and tests run against the real firebase-admin
 * SDK, so CI is green even when the hand-rolled REST client is missing a
 * method the routes call. Three production crashes shipped exactly this way:
 *
 *   1. adminDb.getAll(...)            → GET /api/admin/credit-requests 500'd
 *                                       (silently swallowed by the UI — the
 *                                       owner never saw delegate credit
 *                                       requests).
 *   2. FieldValue.delete()            → clearing a garage's per-garage
 *                                       credit price always failed.
 *   3. adminAuth.deleteUser(uid)      → deleted staff kept live Firebase
 *                                       Auth accounts (error swallowed).
 *
 * This test scans every server route file for the methods it uses and fails
 * unless firebaseWorkerAdmin implements them. If this test fails, implement
 * the missing method in server/firebaseWorkerAdmin.ts — do NOT weaken the
 * test.
 */

const SERVER_DIR = join(process.cwd(), 'server');
const EXCLUDED_FILES = new Set(['firebaseWorkerAdmin.ts', 'firebaseAdmin.ts']);

interface ScanResult {
  methods: string[];
  usage: string[];
}

function collectServerFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !EXCLUDED_FILES.has(entry.name)) files.push(full);
    }
  };
  walk(SERVER_DIR);
  return files;
}

function scan(pattern: RegExp): ScanResult {
  const found = new Map<string, string[]>();
  for (const file of collectServerFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const method = match[1];
      const line = source.slice(0, match.index).split('\n').length;
      const list = found.get(method) || [];
      list.push(`${file.replace(SERVER_DIR, 'server')}:${line}`);
      found.set(method, list);
    }
  }
  return {
    methods: [...found.keys()].sort(),
    usage: [...found.entries()].flatMap(([method, sites]) => sites.map((site) => `${site} uses ${method}()`))
  };
}

describe('production REST client contract (firebaseAdmin → firebaseWorkerAdmin alias)', () => {
  initializeFirebaseAdmin();

  it('implements every adminDb method the routes call', () => {
    const { methods, usage } = scan(/\badminDb\.([a-zA-Z_$][\w$]*)\s*\(/g);
    expect(methods.length, 'sanity: the scan must find adminDb usage').toBeGreaterThan(0);
    const missing = methods.filter((method) => typeof (adminDb as any)[method] !== 'function');
    expect(
      missing,
      `firebaseWorkerAdmin is missing adminDb methods used by routes. The production build aliases ` +
        `firebaseAdmin → firebaseWorkerAdmin (tools/build-cloudflare.mjs), so a missing method is a ` +
        `guaranteed production TypeError. Implement in server/firebaseWorkerAdmin.ts. Usage:\n${usage.join('\n')}`
    ).toEqual([]);
  });

  it('implements every adminAuth method the routes call', () => {
    const { methods, usage } = scan(/\badminAuth\w*\.([a-zA-Z_$][\w$]*)\s*\(/g);
    expect(methods.length, 'sanity: the scan must find adminAuth usage').toBeGreaterThan(0);
    const missing = methods.filter((method) => typeof (adminAuth as any)[method] !== 'function');
    expect(
      missing,
      `firebaseWorkerAdmin is missing adminAuth methods used by routes. Implement in ` +
        `server/firebaseWorkerAdmin.ts. Usage:\n${usage.join('\n')}`
    ).toEqual([]);
  });

  it('implements every FieldValue operation the routes call', () => {
    const { methods, usage } = scan(/\bFieldValue\.([a-zA-Z_$][\w$]*)\s*\(/g);
    expect(methods.length, 'sanity: the scan must find FieldValue usage').toBeGreaterThan(0);
    const missing = methods.filter((method) => typeof (FieldValue as Record<string, unknown>)[method] !== 'function');
    expect(
      missing,
      `FieldValue is missing operations used by routes. Implement in server/firebaseWorkerAdmin.ts ` +
        `(and handle the sentinel in FirestoreRest.write). Usage:\n${usage.join('\n')}`
    ).toEqual([]);
  });

  it('exports every symbol the routes import from firebaseAdmin', async () => {
    const files = collectServerFiles();
    const imported = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*firebaseAdmin'/g)) {
        for (const name of match[1].split(',')) {
          const clean = name.trim().split(/\s+as\s+/).pop()?.trim();
          if (clean) imported.add(clean);
        }
      }
    }
    expect(imported.size, 'sanity: the scan must find firebaseAdmin imports').toBeGreaterThan(0);
    const workerAdmin = await import('./firebaseWorkerAdmin');
    const missing = [...imported].filter((name) => workerAdmin[name as keyof typeof workerAdmin] === undefined);
    expect(
      missing,
      `Routes import symbols from './firebaseAdmin' that firebaseWorkerAdmin does not export. ` +
        `The production build aliases one into the other, so a missing export breaks production only.`
    ).toEqual([]);
  });
});
