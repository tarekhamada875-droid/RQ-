#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const outputDir = resolve(process.env.RQ_FIXTURE_SMOKE_DIR || join(root, 'docs/ui-opt-01-fixture-smoke'));
const appPort = 4174;
const debugPort = 9224;
const projectId = 'demo-rq-ui-fixtures';
const garagePin = '88000001';
const emulatorEnv = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  GCLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_DATABASE_ID: '(default)',
  VITE_RQ_USE_EMULATORS: 'true',
  VITE_RQ_EMULATOR_HOST: '127.0.0.1',
  VITE_RQ_EMULATOR_PROJECT_ID: projectId,
  VITE_RQ_AUTH_EMULATOR_PORT: '9099',
  VITE_RQ_FIRESTORE_EMULATOR_PORT: '8080',
  PORT: String(appPort),
};

function run(command, args, env = emulatorEnv) {
  return spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitFor(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForReachable(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForOutput(process, pattern, timeoutMs = 60_000) {
  return new Promise((resolveOutput, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for process output: ${pattern}`)), timeoutMs);
    const onData = chunk => {
      output += chunk.toString();
      if (pattern.test(output)) {
        clearTimeout(timer);
        process.stdout?.removeListener('data', onData);
        process.stderr?.removeListener('data', onData);
        resolveOutput(output);
      }
    };
    process.stdout.on('data', onData);
    process.stderr.on('data', onData);
    process.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Process exited before readiness (${code}): ${output}`));
    });
  });
}

let messageId = 0;
function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const ready = new Promise((resolveReady, reject) => {
    socket.addEventListener('open', resolveReady);
    socket.addEventListener('error', reject);
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled') {
      const values = (message.params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
      console.log(`[browser:${message.params.type}] ${values}`);
    }
    if (message.method === 'Log.entryAdded') console.log(`[browser:log] ${message.params.entry.text}`);
    if (message.method === 'Network.responseReceived' && /\/api\//.test(message.params.response.url)) {
      console.log(`[browser:api] ${message.params.response.status} ${message.params.response.url}`);
    }
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  const send = async (method, params = {}) => {
    await ready;
    const id = ++messageId;
    return new Promise((resolveResult, reject) => {
      pending.set(id, { resolve: resolveResult, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => socket.close() };
}

async function evaluate(page, expression, awaitPromise = true) {
  const result = await page.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitForBrowserCondition(page, expression, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(page, expression)) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function clickButtonByText(page, text) {
  const clicked = await evaluate(page, `(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find button: ${text}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const emulator = run('npx', ['firebase', 'emulators:start', '--only', 'auth,firestore', '--project', projectId]);
  const server = run('npm', ['run', 'dev']);
  const userDataDir = join(tmpdir(), `rq-fixture-smoke-${process.pid}`);
  const browser = run('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, 'about:blank'], process.env);
  let page;
  try {
    await waitForReachable('http://127.0.0.1:8080/');
    await waitForReachable('http://127.0.0.1:9099/');
    const seed = run('npm', ['run', 'ui-fixtures:seed']);
    await waitForOutput(seed, /seeded/);
    await waitFor(`http://127.0.0.1:${appPort}/`);
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    const browserCdp = connectCdp(version.webSocketDebuggerUrl);
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    page = connectCdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Network.enable');
    await page.send('Performance.enable');
    page.send('Runtime.consoleAPICalled', {}).catch(() => {});
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    const navigation = await page.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
    console.log(`browser navigation: ${JSON.stringify(navigation)}`);
    try {
      await waitForBrowserCondition(page, `document.querySelectorAll('button').length > 0`);
    } catch (error) {
      const diagnostic = await evaluate(page, `({ href: location.href, readyState: document.readyState, title: document.title, body: document.body?.innerText?.slice(0, 500) || '', htmlLength: document.documentElement?.outerHTML?.length || 0 })`);
      throw new Error(`${error.message}; page=${JSON.stringify(diagnostic)}`);
    }
    await sleep(2_000);
    for (const digit of garagePin) await clickButtonByText(page, digit);
    const displayedPin = await evaluate(page, `document.body.innerText.includes(${JSON.stringify(garagePin)})`);
    if (!displayedPin) throw new Error('The eight-digit fixture PIN was not displayed before login');
    await clickButtonByText(page, 'تسجيل الدخول');
    try {
      await waitForBrowserCondition(page, `document.body.innerText.includes('UI Fixture Garage')`, 45_000);
    } catch (error) {
      const diagnostic = await evaluate(page, `({ href: location.href, title: document.title, body: document.body?.innerText?.slice(0, 1200) || '', localStorage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes('view') || key.includes('session') || key.includes('garage'))) })`);
      throw new Error(`${error.message}; authenticated page=${JSON.stringify(diagnostic)}`);
    }
    const result = await evaluate(page, `(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        url: location.href,
        title: document.title,
        containsGarage: document.body.innerText.includes('UI Fixture Garage'),
        domNodes: document.getElementsByTagName('*').length,
        scrollHeight: document.documentElement.scrollHeight,
        navigation: nav ? { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd } : null,
      };
    })()`);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(outputDir, 'garage-mobile-authenticated.png'), Buffer.from(screenshot.data, 'base64'));
    await writeFile(join(outputDir, 'garage-mobile-authenticated.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), browser: version.Browser, viewport: { width: 390, height: 844 }, fixture: 'ui-fixture-garage', result }, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    page.close();
    browserCdp.close();
  } finally {
    for (const child of [browser, server, emulator]) child?.kill('SIGTERM');
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
