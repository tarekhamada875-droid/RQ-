import { describe, expect, it } from 'vitest';
import { spawnProcessTree, stopProcessTree } from '../tools/process-tree.mjs';

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

describe('process-tree cleanup', () => {
  it.skipIf(process.platform === 'win32')('terminates a spawned process and its descendant processes', async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "descendant.once('spawn', () => process.stdout.write('descendant-ready\\n'));",
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const child = spawnProcessTree(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Descendant did not start in time')), 3_000);
        child.stdout?.once('data', () => {
          clearTimeout(timer);
          resolve();
        });
        child.once('error', error => {
          clearTimeout(timer);
          reject(error);
        });
      });
      await stopProcessTree(child, { graceMs: 1_000, forceMs: 1_000 });
      expect(processGroupExists(child.pid!)).toBe(false);
    } finally {
      await stopProcessTree(child, { graceMs: 500, forceMs: 1_000 });
    }
  });
});
