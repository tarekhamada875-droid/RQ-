import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const activeWorkerSources = [
  'server/cloudflareWorker.ts',
  'server/backendOperatorToken.ts',
  'server/firebaseWorkerAdmin.ts'
];

export interface CiCheckFailure {
  step: string;
  message: string;
}

export interface CiCheckResult {
  failures: CiCheckFailure[];
  skippedSteps: string[];
}

export interface CiCheckOptions {
  diagnosticsMode?: boolean;
  cwd?: string;
  runCommand?: (command: string) => void;
  existsSync?: (filePath: string) => boolean;
  readFileSync?: (filePath: string) => string;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export interface CiCheckArguments {
  diagnosticsMode: boolean;
  unsupportedArguments: string[];
}

interface CheckStep {
  name: string;
  run: () => void;
}

export function parseCiCheckArguments(args: readonly string[]): CiCheckArguments {
  return {
    diagnosticsMode: args.includes('--diagnostics'),
    unsupportedArguments: args.filter((argument) => argument !== '--diagnostics')
  };
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as Error & { status?: unknown }).status;
    const signal = (error as Error & { signal?: unknown }).signal;
    if (typeof status === 'number') return `${error.message} (exit code ${status})`;
    if (typeof signal === 'string') return `${error.message} (signal ${signal})`;
    return error.message;
  }
  return String(error);
}

export function runCiChecks(options: CiCheckOptions = {}): CiCheckResult {
  const cwd = options.cwd ?? process.cwd();
  const runCommand = options.runCommand ?? ((command: string) => {
    execSync(command, { stdio: 'inherit', cwd });
  });
  const fileExists = options.existsSync ?? existsSync;
  const readFile = options.readFileSync ?? ((filePath: string) => readFileSync(filePath, 'utf-8'));
  const log = options.log ?? ((message: string) => console.log(message));
  const reportError = options.error ?? ((message: string) => console.error(message));
  const diagnosticsMode = options.diagnosticsMode ?? false;

  const checks: CheckStep[] = [
    {
      name: 'Reproducible Clean Install',
      run: () => {
        if (!fileExists(path.join(cwd, 'package-lock.json'))) {
          throw new Error('package-lock.json missing.');
        }
        runCommand('npm ci --ignore-scripts --no-audit --no-fund');
      }
    },
    {
      name: 'Secret Scanning in active Worker sources',
      run: () => {
        const workerSource = activeWorkerSources
          .map((file) => readFile(path.join(cwd, file)))
          .join('\n');
        if (workerSource.includes('PRIVATE_KEY_HERE') || workerSource.includes('eyJhbGciOi')) {
          throw new Error('Hardcoded JWT or private key detected in active Worker source.');
        }
      }
    },
    {
      name: 'TypeScript Linting (tsc --noEmit)',
      run: () => runCommand('npm run lint')
    },
    {
      name: 'Vitest Automated Test Suite',
      run: () => runCommand('npm run test')
    },
    {
      name: 'Firestore security rules emulator tests',
      run: () => runCommand('npm run test:rules')
    },
    {
      name: 'Cloudflare Pages and Worker production build',
      run: () => runCommand('npm run build')
    },
    {
      name: 'Built Cloudflare Worker artifact smoke',
      run: () => runCommand('npm run smoke:worker-artifact')
    },
    {
      name: 'Maintainability checks',
      run: () => runCommand('npm run maintainability:check')
    },
    {
      name: 'Production Artifact Verification',
      run: () => {
        const indexHtmlExists = fileExists(path.join(cwd, 'dist/index.html'));
        const workerJsExists = fileExists(path.join(cwd, 'dist/worker.js'));
        if (!indexHtmlExists || !workerJsExists) {
          throw new Error('dist/index.html or dist/worker.js is missing.');
        }
      }
    }
  ];

  const failures: CiCheckFailure[] = [];
  let skippedSteps: string[] = [];

  for (const [index, check] of checks.entries()) {
    log(`[CHECK] ${check.name}...`);
    try {
      check.run();
      log(`[PASS] ${check.name} succeeded.\n`);
    } catch (error) {
      const message = describeFailure(error);
      failures.push({ step: check.name, message });
      reportError(`[FAIL] ${check.name} failed: ${message}\n`);

      if (!diagnosticsMode) {
        skippedSteps = checks.slice(index + 1).map((remaining) => remaining.name);
        if (skippedSteps.length > 0) {
          reportError(`[STOP] Fail-fast mode skipped: ${skippedSteps.join(' → ')}.`);
          reportError('[STOP] To collect multiple failures, rerun: npm run ci:check -- --diagnostics');
        }
        break;
      }
    }
  }

  return { failures, skippedSteps };
}
