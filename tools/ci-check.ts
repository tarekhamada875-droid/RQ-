import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('    PRODUCTION GATE AUTOMATED CHECK (HONO)');
console.log('====================================================\n');

let failed = false;

function runStep(name: string, command: string) {
  console.log(`[CHECK] ${name}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`[PASS] ${name} succeeded.\n`);
  } catch {
    console.error(`[FAIL] ${name} failed!\n`);
    failed = true;
  }
}

console.log('[CHECK] Reproducible Clean Install...');
if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
  runStep('npm ci lockfile verification', 'npm ci --ignore-scripts --no-audit --no-fund');
} else {
  console.error('[FAIL] package-lock.json missing!\n');
  failed = true;
}

console.log('[CHECK] Secret Scanning in active Worker sources...');
try {
  const activeSourceFiles = [
    'server/cloudflareWorker.ts',
    'server/backendOperatorToken.ts',
    'server/firebaseWorkerAdmin.ts'
  ];
  const workerSource = activeSourceFiles
    .map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf-8'))
    .join('\n');
  if (workerSource.includes('PRIVATE_KEY_HERE') || workerSource.includes('eyJhbGciOi')) {
    console.error('[FAIL] Hardcoded JWT or private key detected in active Worker source!\n');
    failed = true;
  } else {
    console.log('[PASS] No hardcoded JWT or private key detected in active Worker source.\n');
  }
} catch {
  console.error('[FAIL] Could not scan active Worker source!\n');
  failed = true;
}

runStep('TypeScript Linting (tsc --noEmit)', 'npm run lint');
runStep('Vitest Automated Test Suite', 'npm run test');
runStep('Firestore security rules emulator tests', 'npm run test:rules');
runStep('Cloudflare Pages and Worker production build', 'npm run build');
runStep('Built Cloudflare Worker artifact smoke', 'npm run smoke:worker-artifact');

console.log('[CHECK] Production Artifact Verification...');
const indexHtmlExists = fs.existsSync(path.join(process.cwd(), 'dist/index.html'));
const workerJsExists = fs.existsSync(path.join(process.cwd(), 'dist/worker.js'));
if (indexHtmlExists && workerJsExists) {
  console.log('[PASS] dist/index.html and dist/worker.js exist.\n');
} else {
  console.error('[FAIL] Cloudflare production artifacts are missing from dist/!\n');
  failed = true;
}

if (failed) {
  console.error('====================================================');
  console.error(' [RELEASE BLOCKED] Production gate check failed.');
  console.error('====================================================');
  process.exit(1);
} else {
  console.log('====================================================');
  console.log(' [RELEASE PASSED] All production gate checks green!');
  console.log('====================================================');
  process.exit(0);
}
