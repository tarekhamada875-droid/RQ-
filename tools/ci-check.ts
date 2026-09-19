import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('====================================================');
console.log('    PRODUCTION GATE AUTOMATED CHECK (FIX 05)');
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

// 1. Reproducible clean install. Presence of a lockfile is not sufficient.
console.log('[CHECK] Reproducible Clean Install...');
if (fs.existsSync(path.join(process.cwd(), 'package-lock.json'))) {
  runStep('npm ci lockfile verification', 'npm ci --ignore-scripts --no-audit --no-fund');
} else {
  console.error('[FAIL] package-lock.json missing!\n');
  failed = true;
}

// 2. Secret Scanning Audit (No hardcoded secrets)
console.log('[CHECK] Secret Scanning in codebase...');
try {
  const serverCode = fs.readFileSync(path.join(process.cwd(), 'server/app.ts'), 'utf-8');
  if (serverCode.includes('PRIVATE_KEY_HERE') || serverCode.includes('eyJhbGciOi')) {
    console.error('[FAIL] Hardcoded JWT or private key detected!\n');
    failed = true;
  } else {
    console.log('[PASS] No hardcoded JWT or private key detected in server/app.ts.\n');
  }
} catch {
  console.error('[FAIL] Could not scan server code!\n');
  failed = true;
}

// 3. TypeScript Typecheck & Lint
runStep('TypeScript Linting (tsc --noEmit)', 'npm run lint');

// 4. Vitest Unit & Integration Test Suite
runStep('Vitest Automated Test Suite', 'npm run test');

// 5. Production Build
runStep('Production Bundling (Vite + Esbuild)', 'npm run build');

// 6. Verify Production Artifacts
console.log('[CHECK] Production Artifact Verification...');
const indexHtmlExists = fs.existsSync(path.join(process.cwd(), 'dist/index.html'));
const serverCjsExists = fs.existsSync(path.join(process.cwd(), 'dist/server.cjs'));

if (indexHtmlExists && serverCjsExists) {
  console.log('[PASS] dist/index.html and dist/server.cjs exist.\n');
} else {
  console.error('[FAIL] Production build artifacts missing in dist/!\n');
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
