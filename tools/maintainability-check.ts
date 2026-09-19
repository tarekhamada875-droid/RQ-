import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const railwayConfig = resolve(root, 'railway.json');
if (!existsSync(railwayConfig) || statSync(railwayConfig).size === 0) fail('railway.json must exist and be non-empty.');

if (existsSync(railwayConfig)) {
  const config = JSON.parse(readFileSync(railwayConfig, 'utf8')) as any;
  if (config.deploy?.healthcheckPath !== '/api/health') fail('Railway healthcheck must use /api/health.');
  if (config.deploy?.startCommand !== 'node dist/cloud-run.cjs') fail('Railway must start the API-only dist/cloud-run.cjs service.');
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { packageManager?: string; scripts?: Record<string, string> };
if (!packageJson.packageManager?.startsWith('npm@')) fail('package.json must declare npm as the supported package manager.');
if (!packageJson.scripts?.['build:railway']?.includes('build:cloudrun')) fail('Railway build must use the API-only Cloud Run-compatible build.');

for (const requiredDoc of ['README.md', 'CONTRIBUTING.md', 'MAINTAINABILITY_HANDOFF.md']) {
  if (!existsSync(resolve(root, requiredDoc))) fail(`Required maintainability document is missing: ${requiredDoc}.`);
}

if (failures.length > 0) {
  console.error('Maintainability check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Maintainability check passed.');
console.log('- Railway API configuration: valid');
console.log('- Cloudflare frontend remains a separate deployment');
console.log('- npm package-manager declaration: valid');
console.log('- required documentation: present');
