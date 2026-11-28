import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const wranglerConfig = resolve(root, 'wrangler.toml');
if (!existsSync(wranglerConfig) || statSync(wranglerConfig).size === 0) {
  fail('wrangler.toml must exist and be non-empty for Cloudflare Worker deployment.');
} else {
  const content = readFileSync(wranglerConfig, 'utf8');
  if (!content.includes('name = "rq-backend"') && !content.includes('name = "rq"')) fail('wrangler.toml must declare name = "rq-backend" or "rq".');
  if (!content.includes('main = "server/cloudflareWorker.ts"')) fail('wrangler.toml must point to server/cloudflareWorker.ts.');
  if (!content.includes('"nodejs_compat"')) fail('wrangler.toml must enable nodejs_compat.');
}

// Audit fix (2026-11-21): deploys use wrangler.deploy.toml (dist/worker.js +
// cron + observability + WORKER_SELF_URL), while the checks above pin the
// DEV config (wrangler.toml). A silent edit that drops the cron, observability
// or the self-URL from the DEPLOY config would remove the keep-warm ping /
// observability with no error anywhere. Pin the deploy-critical lines here.
const deployConfig = resolve(root, 'wrangler.deploy.toml');
if (!existsSync(deployConfig)) {
  fail('wrangler.deploy.toml must exist — it is the config production deploys use.');
} else {
  const deployContent = readFileSync(deployConfig, 'utf8');
  if (!deployContent.includes('main = "dist/worker.js"')) fail('wrangler.deploy.toml must deploy the built bundle: main = "dist/worker.js".');
  if (!deployContent.includes('crons = [')) fail('wrangler.deploy.toml must declare the keep-warm cron (crons = [...]).');
  if (!deployContent.includes('WORKER_SELF_URL')) fail('wrangler.deploy.toml must define WORKER_SELF_URL.');
  if (!deployContent.includes('PIN_RATE_LIMITER')) fail('wrangler.deploy.toml must keep the PIN_RATE_LIMITER Durable Object binding.');
  // Smart Placement regression guard (perf audit 2026-11-28): the [placement]
  // mode = "smart" block co-locates the Worker with Firestore (europe-west3),
  // cutting ~145ms per check-in/out. A silent removal would silently regress
  // latency with no error elsewhere — pin it here.
  if (!/\[placement\]/.test(deployContent) || !/mode\s*=\s*"smart"/.test(deployContent)) {
    fail('wrangler.deploy.toml must declare [placement] mode = "smart" to co-locate the Worker with Firestore.');
  }
}

// Rhythm-audit fix (2026-11-21): the shared [vars] are duplicated by hand
// across the dev and deploy configs, and nothing compared them — a one-file
// edit (e.g. ALLOWED_ORIGINS) would silently diverge dev from production.
// Every var defined in wrangler.toml must exist with the identical value in
// wrangler.deploy.toml (deploy may define extra operational vars like
// WORKER_SELF_URL, which the deploy-critical pins above already guard).
function parseWranglerVars(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  const section = content.match(/^\[vars\]\s*$/m);
  if (!section || section.index === undefined) return vars;
  const start = section.index + section[0].length;
  const rest = content.slice(start);
  const nextSection = rest.search(/^\[/m);
  const body = nextSection === -1 ? rest : rest.slice(0, nextSection);
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/);
    if (match) vars.set(match[1], match[2]);
  }
  return vars;
}

if (existsSync(wranglerConfig) && existsSync(deployConfig)) {
  const devVars = parseWranglerVars(readFileSync(wranglerConfig, 'utf8'));
  const deployVars = parseWranglerVars(readFileSync(deployConfig, 'utf8'));
  for (const [key, value] of devVars) {
    if (!deployVars.has(key)) fail(`wrangler.deploy.toml is missing [vars] key "${key}" that wrangler.toml defines — keep the two configs in parity.`);
    else if (deployVars.get(key) !== value) fail(`[vars] "${key}" differs between wrangler.toml and wrangler.deploy.toml — keep the two configs in parity.`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { packageManager?: string; scripts?: Record<string, string> };
if (!packageJson.packageManager?.startsWith('npm@')) fail('package.json must declare npm as the supported package manager.');
if (!packageJson.scripts?.['build:cloudflare']) fail('package.json must declare build:cloudflare script.');

for (const strayLock of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
  if (existsSync(resolve(root, strayLock))) fail(`Secondary lockfile ${strayLock} must not exist; project is standardized on npm.`);
}

const allowedRootMarkdown = new Set(['README.md', 'AGENTS.md', 'CONTRIBUTING.md']);
for (const entry of readdirSync(root)) {
  if (entry.endsWith('.md') && !allowedRootMarkdown.has(entry)) {
    fail(`Root-level Markdown is not allowed: ${entry}. Add durable guidance to the canonical docs/ files instead.`);
  }
}

const docsRoot = resolve(root, 'docs');
const allowedDocsMarkdown = new Set([
  'OPERATIONS.md',
  'PROJECT.md',
  'LAST-PLAN-BEFORE-PRODUCTION.md',
  'RELEASES.md',
  'SECURITY.md',
  'duplication-contract-tests.md',
  // Owner-approved design doc for the offline-mode build (PRs #748, #749, #750).
  // Latent issue: this entry was missing when the doc shipped, but production-gate's
  // Markdown-only scope detector skipped the maintainability check on those PRs
  // (they only touched docs/), so CI never caught it. Non-docs PRs (like the offline
  // Step 1 PR) WOULD run the check and fail — so this entry is required for any
  // further work to land. Added by the Step 1 implementer with owner approval.
  'OFFLINE-MODE-PLAN.md',
]);
if (existsSync(docsRoot)) {
  for (const entry of readdirSync(docsRoot)) {
    if (entry.endsWith('.md') && !allowedDocsMarkdown.has(entry)) {
      fail(`Unapproved docs/ Markdown is not allowed: ${entry}. Consolidate it into the canonical documents.`);
    }
  }
}

for (const forbiddenDoc of [
  'PROJECT_WORKING_AGREEMENT.md',
  'PROJECT_ENGINEERING_KNOWLEDGE.md',
  'RQ_HANDOFF.md',
  'BUSINESS_LOGIC_FIX_PLAN.md',
  'BRANCHING_AND_RELEASES.md',
  'OPERATION_TRAIL_GUIDE.md',
  'security_spec.md',
]) {
  if (existsSync(resolve(root, forbiddenDoc))) fail(`Duplicate or retired documentation file must not return: ${forbiddenDoc}.`);
}

for (const requiredDoc of ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'docs/PROJECT.md', 'docs/SECURITY.md', 'docs/RELEASES.md', 'docs/OPERATIONS.md']) {
  if (!existsSync(resolve(root, requiredDoc))) fail(`Required canonical document is missing: ${requiredDoc}.`);
}

if (failures.length > 0) {
  console.error('Maintainability check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Maintainability check passed.');
console.log('- Cloudflare Worker deployment configuration: valid');
console.log('- Cloudflare frontend remains a separate deployment');
console.log('- npm package-manager declaration: valid');
console.log('- canonical documentation set: present');
