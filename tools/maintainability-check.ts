import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

const apiEntry = resolve(root, 'api/index.js');
if (!existsSync(apiEntry) || statSync(apiEntry).size === 0) {
  fail('api/index.js must exist and be non-empty because Vercel discovers the API function from this path.');
}

const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
if (/^api\/index\.js\s*$/m.test(gitignore)) {
  fail('.gitignore must not ignore api/index.js while the Vercel entry point is tracked.');
}

const vercelConfig = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  rewrites?: Array<{ source?: string; destination?: string }>;
};
const rewrites = vercelConfig.rewrites ?? [];
const apiRewriteIndex = rewrites.findIndex((rewrite) => rewrite.source === '/api/(.*)' && rewrite.destination === '/api/index.js');
const spaRewriteIndex = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)' && rewrite.destination === '/index.html');
if (apiRewriteIndex < 0) fail('vercel.json must rewrite /api/(.*) to /api/index.js.');
if (spaRewriteIndex >= 0 && apiRewriteIndex >= spaRewriteIndex) {
  fail('The API rewrite must appear before the SPA fallback rewrite in vercel.json.');
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  packageManager?: string;
  scripts?: Record<string, string>;
};
if (!packageJson.packageManager?.startsWith('npm@')) {
  fail('package.json must declare npm as the supported package manager.');
}
if (!packageJson.scripts?.build?.includes('api/index.js')) {
  fail('The production build must generate api/index.js.');
}

if (existsSync(apiEntry)) {
  const bundle = readFileSync(apiEntry, 'utf8');
  const embeddedSecretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{80,}-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
    /(?:private_key|privateKey)\s*[:=]\s*["'][^"']*-----BEGIN [^"']+PRIVATE KEY-----[^"']+-----END [^"']+PRIVATE KEY-----[^"']*["']/,
    /client_email\s*[:=]\s*["'][^"']+@[^"']+\.gserviceaccount\.com["']/,
  ];
  for (const pattern of embeddedSecretPatterns) {
    if (pattern.test(bundle)) fail(`api/index.js appears to contain embedded credential material matching ${pattern}.`);
  }
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
console.log(`- Vercel API bundle: ${Math.round(statSync(apiEntry).size / 1024)} KiB`);
console.log('- API rewrite and SPA fallback order: valid');
console.log('- npm package-manager declaration: valid');
console.log('- required documentation: present');
console.log('- embedded-secret scan: passed');
