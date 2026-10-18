import { describe, expect, it } from 'vitest';
import { parseCiCheckArguments, runCiChecks } from '../../tools/ci-check-runner';

const installCommand = 'npm ci --ignore-scripts --no-audit --no-fund';
const commands = [
  installCommand,
  'npm run lint',
  'npm run test',
  'npm run test:rules',
  'npm run build',
  'npm run smoke:worker-artifact',
  'npm run maintainability:check'
];

const checkNames = [
  'Reproducible Clean Install',
  'Secret Scanning in active Worker sources',
  'TypeScript Linting (tsc --noEmit)',
  'Vitest Automated Test Suite',
  'Firestore security rules emulator tests',
  'Cloudflare Pages and Worker production build',
  'Built Cloudflare Worker artifact smoke',
  'Maintainability checks',
  'Production Artifact Verification'
];

function createHarness(failCommand?: string) {
  const executedCommands: string[] = [];
  const checkedPaths: string[] = [];
  const readPaths: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const files = new Set([
    '/repo/package-lock.json',
    '/repo/dist/index.html',
    '/repo/dist/worker.js'
  ]);

  return {
    options: {
      cwd: '/repo',
      runCommand(command: string) {
        executedCommands.push(command);
        if (command === failCommand) throw new Error(`Injected nonzero exit for ${command}`);
      },
      existsSync(filePath: string) {
        checkedPaths.push(filePath);
        return files.has(filePath);
      },
      readFileSync(filePath: string) {
        readPaths.push(filePath);
        return 'safe synthetic source';
      },
      log(message: string) {
        logs.push(message);
      },
      error(message: string) {
        errors.push(message);
      }
    },
    executedCommands,
    checkedPaths,
    readPaths,
    logs,
    errors
  };
}

const earlyFailures = [
  {
    command: installCommand,
    step: 'Reproducible Clean Install',
    expectedCommands: [installCommand],
    expectedReadCount: 0
  },
  {
    command: 'npm run lint',
    step: 'TypeScript Linting (tsc --noEmit)',
    expectedCommands: [installCommand, 'npm run lint'],
    expectedReadCount: 3
  },
  {
    command: 'npm run test',
    step: 'Vitest Automated Test Suite',
    expectedCommands: [installCommand, 'npm run lint', 'npm run test'],
    expectedReadCount: 3
  }
];

describe('local CI-check runner', () => {
  it.each(earlyFailures)('stops after a failed $step check', ({ command, step, expectedCommands, expectedReadCount }) => {
    const harness = createHarness(command);
    const result = runCiChecks(harness.options);
    const failedIndex = checkNames.indexOf(step);

    expect(harness.executedCommands).toEqual(expectedCommands);
    expect(harness.readPaths).toHaveLength(expectedReadCount);
    expect(harness.checkedPaths).not.toContain('/repo/dist/index.html');
    expect(harness.checkedPaths).not.toContain('/repo/dist/worker.js');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual({ step, message: `Injected nonzero exit for ${command}` });
    expect(result.skippedSteps).toEqual(checkNames.slice(failedIndex + 1));
    expect(harness.errors.join('\n')).toContain(`Injected nonzero exit for ${command}`);
    expect(harness.errors.join('\n')).toContain('npm run ci:check -- --diagnostics');
  });

  it('runs every required check, including artifact and maintainability checks, when all checks pass', () => {
    const harness = createHarness();
    const result = runCiChecks(harness.options);

    expect(harness.executedCommands).toEqual(commands);
    expect(harness.checkedPaths).toContain('/repo/package-lock.json');
    expect(harness.checkedPaths).toContain('/repo/dist/index.html');
    expect(harness.checkedPaths).toContain('/repo/dist/worker.js');
    expect(harness.readPaths).toHaveLength(3);
    expect(result).toEqual({ failures: [], skippedSteps: [] });
    expect(harness.logs.filter((message) => message.startsWith('[PASS]'))).toHaveLength(checkNames.length);
  });

  it('continues through remaining checks only when diagnostics mode is explicitly enabled', () => {
    const harness = createHarness('npm run lint');
    const result = runCiChecks({ ...harness.options, diagnosticsMode: true });

    expect(harness.executedCommands).toEqual(commands);
    expect(harness.checkedPaths).toContain('/repo/dist/index.html');
    expect(harness.checkedPaths).toContain('/repo/dist/worker.js');
    expect(result.failures).toEqual([{
      step: 'TypeScript Linting (tsc --noEmit)',
      message: 'Injected nonzero exit for npm run lint'
    }]);
    expect(result.skippedSteps).toEqual([]);
    expect(harness.errors.join('\n')).not.toContain('rerun: npm run ci:check -- --diagnostics');
  });

  it('accepts only the explicit diagnostics option', () => {
    expect(parseCiCheckArguments([])).toEqual({ diagnosticsMode: false, unsupportedArguments: [] });
    expect(parseCiCheckArguments(['--diagnostics'])).toEqual({ diagnosticsMode: true, unsupportedArguments: [] });
    expect(parseCiCheckArguments(['--unknown'])).toEqual({ diagnosticsMode: false, unsupportedArguments: ['--unknown'] });
  });
});
