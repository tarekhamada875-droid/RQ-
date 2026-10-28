import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export function spawnProcessTree(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
  });
}

function processTreeIsRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function signalProcessTree(child, signal) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    killer.once('error', error => {
      if (error.code !== 'ENOENT') console.error(`Unable to terminate child process tree: ${error.message}`);
    });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function waitForProcessTreeExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processTreeIsRunning(child?.pid)) return true;
    await sleep(50);
  }
  return !processTreeIsRunning(child?.pid);
}

export async function stopProcessTree(child, { graceMs = 3_000, forceMs = 2_000 } = {}) {
  if (!child?.pid || !processTreeIsRunning(child.pid)) return;

  signalProcessTree(child, 'SIGTERM');
  if (await waitForProcessTreeExit(child, graceMs)) return;

  signalProcessTree(child, 'SIGKILL');
  if (!(await waitForProcessTreeExit(child, forceMs))) {
    throw new Error(`Process tree ${child.pid} did not exit after SIGKILL`);
  }
}
