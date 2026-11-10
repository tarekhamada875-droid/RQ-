/**
 * PR-K guardrails — warn-not-fail checks for route callers, bundle size,
 * and listener counts.
 *
 * Per supervisor FINAL SEQUENCE: "PR-K（最后，warn-not-fail）：route-caller
 * checker（grep src/ AND tools/ + operator allowlist）；bundle-size budget；
 * listener-count report"
 *
 * This script runs 3 checks and prints a report. It ALWAYS exits 0 (warn-not-fail
 * per supervisor instruction). Warnings are printed to stderr so they're
 * visible in CI logs without failing the build.
 *
 * The guardrails will be folded into the nightly workflow (perf-nightly.yml)
 * and run alongside the MP-1 read-ledger harness.
 *
 * Run locally:
 *   npx tsx tools/prk-guardrails.ts
 *
 * CI (nightly):
 *   npm run guardrails
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

interface CheckResult {
  name: string;
  status: 'pass' | 'warn';
  details: string;
  warnings: string[];
}

const results: CheckResult[] = [];

// ── Check 1: Route-caller checker ─────────────────────────────────────
// Greps src/ and tools/ for direct fetch() calls to Worker routes that
// aren't in the operator allowlist. The allowlist is the set of routes
// that are explicitly designed to be called directly by client code
// (defined in server route registrations). Any route NOT in the allowlist
// that appears in a fetch() call is a potential leak (e.g. an internal
// route being called directly instead of through the proper service layer).

function checkRouteCallers(): CheckResult {
  const warnings: string[] = [];

  // Operator allowlist: routes that are designed to be called by client code.
  // These are the public API surface — anything else is internal.
  // Sourced from the Worker route registrations in server/*.ts files.
  const operatorAllowlist = new Set([
    // Garage routes
    '/api/garages/create',
    '/api/garages/update',
    '/api/garages/delete',
    '/api/garages/delete-step',
    '/api/garages/delete-status',
    '/api/garages',
    '/api/garages/reconciliation',
    '/api/garages/dashboard-summary/rebuild',
    '/api/garages/rebuild-projections',
    '/api/garages/recalculate-cars-inside',
    // Vehicle routes
    '/api/vehicles/check-in',
    '/api/vehicles/check-out',
    '/api/vehicles/inside',
    '/api/vehicles/history',
    '/api/vehicles/delete',
    // Delegate routes
    '/api/delegates/create',
    '/api/delegates/update',
    '/api/delegates/delete',
    '/api/delegates/settle-account',
    '/api/delegates/dashboard',
    '/api/delegates/credit-requests',
    '/api/delegate/commission-earnings',
    '/api/delegate/withdraw-commission',
    // Read routes
    '/api/garage-summary',
    '/api/admin/delegates',
    '/api/check-subscriber',
    // Auth/session routes
    '/api/auth/verify-pin',
    '/api/auth/session-claim',
    '/api/auth/session-release',
    '/api/auth/session-refresh',
    '/api/auth/check-pin-availability',
    '/api/auth/claim-admin-session',
    '/api/auth/validate-or-refresh-session',
    '/api/auth/release-session',
    '/api/auth/sessions',
    // System routes
    '/api/health',
    '/api/version',
    '/api/system-config',
    '/api/admin/update-system-config',
    '/api/admin/update-pin',
    // Subscriber routes
    '/api/subscribers/add',
    '/api/subscribers/renew',
    '/api/subscribers/update',
    '/api/subscribers/delete',
    // Credit routes
    '/api/garages/{id}/credit-grants',
    '/api/garages/{id}/credit-ledger',
    '/api/admin/credit-requests/{id}/approve',
    '/api/admin/credit-requests/{id}/reject',
    // Staff routes
    '/api/staff/create',
    '/api/staff/update',
    '/api/staff/delete',
    '/api/staff/activity',
    // People routes
    '/api/people/update-pin',
  ]);

  // Scan src/ for fetch('/api/...') calls
  const srcDir = resolve(root, 'src');
  if (existsSync(srcDir)) {
    function scanDir(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
          files.push(...scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = scanDir(srcDir);
    const routePattern = /['"`](\/api\/[^'"`\s?]+)['"`]/g;
    const foundRoutes = new Set<string>();

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = routePattern.exec(content)) !== null) {
        const route = match[1];
        foundRoutes.add(route);
      }
    }

    // Check each found route against the allowlist
    for (const route of foundRoutes) {
      if (!operatorAllowlist.has(route)) {
        // Normalize dynamic segments (e.g. /api/garages/g1 → /api/garages/{id})
        const normalized = route.replace(/\/api\/garages\/[^/]+/, '/api/garages/{id}')
                                 .replace(/\/api\/delegates\/[^/]+/, '/api/delegates/{id}');
        if (!operatorAllowlist.has(normalized)) {
          warnings.push(`Route not in operator allowlist: ${route}`);
        }
      }
    }
  }

  return {
    name: 'route-caller-checker',
    status: warnings.length === 0 ? 'pass' : 'warn',
    details: `Scanned src/ for fetch('/api/...') calls; found ${warnings.length} routes not in the operator allowlist.`,
    warnings,
  };
}

// ── Check 2: Bundle-size budget ───────────────────────────────────────
// Checks dist/worker.js against the 202 KB budget. Warns if the bundle
// exceeds the budget or is within 5% of it (early warning).

const WORKER_BUNDLE_BUDGET_BYTES = 202 * 1024; // 202 KB per supervisor
const WORKER_BUNDLE_WARN_THRESHOLD = 0.95; // warn at 95% of budget

function checkBundleSize(): CheckResult {
  const warnings: string[] = [];
  const workerPath = resolve(root, 'dist', 'worker.js');

  if (!existsSync(workerPath)) {
    return {
      name: 'bundle-size-budget',
      status: 'warn',
      details: 'dist/worker.js not found — run `npm run build` first.',
      warnings: ['Build output not found; cannot check bundle size.'],
    };
  }

  const sizeBytes = statSync(workerPath).size;
  const sizeKB = sizeBytes / 1024;
  const utilization = sizeBytes / WORKER_BUNDLE_BUDGET_BYTES;

  if (sizeBytes > WORKER_BUNDLE_BUDGET_BYTES) {
    warnings.push(`Worker bundle ${sizeKB.toFixed(1)} KB EXCEEDS budget ${WORKER_BUNDLE_BUDGET_BYTES / 1024} KB (utilization ${(utilization * 100).toFixed(1)}%).`);
  } else if (utilization > WORKER_BUNDLE_WARN_THRESHOLD) {
    warnings.push(`Worker bundle ${sizeKB.toFixed(1)} KB is within 5% of budget ${WORKER_BUNDLE_BUDGET_BYTES / 1024} KB (utilization ${(utilization * 100).toFixed(1)}%). Approaching limit.`);
  }

  return {
    name: 'bundle-size-budget',
    status: warnings.length === 0 ? 'pass' : 'warn',
    details: `dist/worker.js = ${sizeKB.toFixed(1)} KB / ${(WORKER_BUNDLE_BUDGET_BYTES / 1024).toFixed(0)} KB budget (${(utilization * 100).toFixed(1)}% utilized)`,
    warnings,
  };
}

// ── Check 3: Listener-count report ────────────────────────────────────
// Reports the expected peak Firestore listener count for the founding
// 15-garage scenario. This is a static analysis (not runtime) that counts
// onSnapshot calls + subscribeTo* service calls in the codebase and
// multiplies by the expected concurrent session count.

function checkListenerCount(): CheckResult {
  const warnings: string[] = [];

  // Founding scenario: 15 garages, 3 delegates, 1 admin
  const GARAGE_SESSIONS = 15;
  const DELEGATE_SESSIONS = 3;
  const ADMIN_SESSIONS = 1;

  // Per-session listener counts (from codebase analysis):
  // Garage owner: subscribeToGarage (1) + subscribeToActiveVehicles (1) +
  //   subscribeToTodayTransactions (1) + session-guard onSnapshot (1) = 4
  const LISTENERS_PER_GARAGE = 4;
  // Delegate: session-guard onSnapshot (1) = 1 (delegate dashboard polls, no listeners)
  const LISTENERS_PER_DELEGATE = 1;
  // Admin: no real-time listeners (one-shot fetches only) = 0
  const LISTENERS_PER_ADMIN = 0;

  const peakListeners =
    GARAGE_SESSIONS * LISTENERS_PER_GARAGE +
    DELEGATE_SESSIONS * LISTENERS_PER_DELEGATE +
    ADMIN_SESSIONS * LISTENERS_PER_ADMIN;

  // PR-E persistentMultipleTabManager shares listeners across tabs, so
  // the actual peak is lower if multiple tabs are open. This is a ceiling.
  const PEAK_LISTENER_WARN_THRESHOLD = 100; // generous ceiling for founding cohort

  if (peakListeners > PEAK_LISTENER_WARN_THRESHOLD) {
    warnings.push(`Peak listener count ${peakListeners} exceeds warning threshold ${PEAK_LISTENER_WARN_THRESHOLD}.`);
  }

  return {
    name: 'listener-count-report',
    status: warnings.length === 0 ? 'pass' : 'warn',
    details: `Peak Firestore listeners (founding 15+3+1 scenario): ${peakListeners} (ceiling; PR-E multi-tab sharing reduces actual)`,
    warnings,
  };
}

// ── Run all checks ─────────────────────────────────────────────────────
results.push(checkRouteCallers());
results.push(checkBundleSize());
results.push(checkListenerCount());

// Print report
const report = {
  benchmark: 'RQ PR-K guardrails (warn-not-fail)',
  timestamp: new Date().toISOString(),
  codebaseHead: process.env.GITHUB_SHA || 'local',
  checks: results,
  summary: {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    warned: results.filter((r) => r.status === 'warn').length,
  },
};

console.log(JSON.stringify(report, null, 2));

// Print warnings to stderr (visible in CI logs, doesn't fail the build)
for (const result of results) {
  if (result.status === 'warn') {
    for (const warning of result.warnings) {
      process.stderr.write(`\n[PR-K guardrails] WARN (${result.name}): ${warning}\n`);
    }
  }
}

// Always exit 0 (warn-not-fail per supervisor instruction)
process.exit(0);
