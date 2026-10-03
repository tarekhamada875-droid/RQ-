import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];
const fail = (message: string) => failures.push(message);

// Cloudflare Worker deployment configuration validation
const wranglerConfig = resolve(root, 'wrangler.toml');
if (!existsSync(wranglerConfig) || statSync(wranglerConfig).size === 0) {
  fail('wrangler.toml must exist and be non-empty for Cloudflare Worker deployment.');
} else {
  const content = readFileSync(wranglerConfig, 'utf8');
  if (!content.includes('name = "rq-backend"') && !content.includes('name = "rq"')) fail('wrangler.toml must declare name = "rq-backend" or "rq".');
  if (!content.includes('main = "server/cloudflareWorker.ts"')) fail('wrangler.toml must point to server/cloudflareWorker.ts.');
  if (!content.includes('"nodejs_compat"')) fail('wrangler.toml must enable nodejs_compat.');
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { packageManager?: string; scripts?: Record<string, string> };
if (!packageJson.packageManager?.startsWith('npm@')) fail('package.json must declare npm as the supported package manager.');
if (!packageJson.scripts?.['build:cloudflare']) fail('package.json must declare build:cloudflare script.');

// Optional Railway transition validation if railway.json is present
const railwayConfig = resolve(root, 'railway.json');
if (existsSync(railwayConfig) && statSync(railwayConfig).size > 0) {
  const config = JSON.parse(readFileSync(railwayConfig, 'utf8')) as any;
  if (config.deploy?.healthcheckPath !== '/api/health') fail('Railway healthcheck must use /api/health.');
}

for (const strayLock of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
  if (existsSync(resolve(root, strayLock))) fail(`Secondary lockfile ${strayLock} must not exist; project is standardized on npm.`);
}

for (const requiredDoc of ['README.md', 'CONTRIBUTING.md', 'MAINTAINABILITY_HANDOFF.md']) {
  if (!existsSync(resolve(root, requiredDoc))) fail(`Required maintainability document is missing: ${requiredDoc}.`);
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
console.log('- required documentation: present');
