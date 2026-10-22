#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { spawnProcessTree, stopProcessTree } from './process-tree.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const outputDir = resolve(process.env.RQ_FIXTURE_SMOKE_DIR || join(root, 'docs/ui-opt-01-fixture-smoke'));
const appPort = 4174;
const debugPort = 9224;
const projectId = 'demo-rq-ui-fixtures';
const role = process.env.RQ_FIXTURE_ROLE || 'garage';
const viewportName = process.env.RQ_FIXTURE_VIEWPORT || 'mobile';
const viewportProfiles = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
};
const viewport = viewportProfiles[viewportName];
if (!viewport) throw new Error(`Unsupported RQ_FIXTURE_VIEWPORT: ${viewportName}`);
const scenarios = {
  garage: { pin: '88000001', route: '/', entryText: null, loginText: 'تسجيل الدخول', expectedText: 'UI Fixture Garage', output: 'garage-mobile-authenticated' },
  admin: { pin: '88000000', route: '/#/admin', entryText: null, loginText: 'دخول', expectedText: 'لوحة تحكم النظام', output: 'admin-mobile-authenticated' },
  delegate: { pin: '88000003', route: '/', entryText: 'دخول المندوب', loginText: 'دخول للوحة الشحن', expectedText: 'لوحة المندوب', output: 'delegate-mobile-authenticated' },
};
const scenario = scenarios[role];
if (!scenario) throw new Error(`Unsupported RQ_FIXTURE_ROLE: ${role}`);
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
  return spawnProcessTree(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
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

async function waitForBrowserCondition(page, expression, timeoutMs = 30_000, pollIntervalMs = 200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(page, expression)) return;
    await sleep(pollIntervalMs);
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

async function clickPinDigits(page, pin) {
  for (const digit of pin) await clickButtonByText(page, digit);
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
    await page.send('Emulation.setDeviceMetricsOverride', viewport);
    const navigation = await page.send('Page.navigate', { url: `http://127.0.0.1:${appPort}${scenario.route}` });
    console.log(`browser navigation: ${JSON.stringify(navigation)}`);
    try {
      await waitForBrowserCondition(page, `document.querySelectorAll('button').length > 0`);
    } catch (error) {
      const diagnostic = await evaluate(page, `({ href: location.href, readyState: document.readyState, title: document.title, body: document.body?.innerText?.slice(0, 500) || '', htmlLength: document.documentElement?.outerHTML?.length || 0 })`);
      throw new Error(`${error.message}; page=${JSON.stringify(diagnostic)}`);
    }
    await sleep(2_000);
    if (scenario.entryText) await clickButtonByText(page, scenario.entryText);
    await clickPinDigits(page, scenario.pin);
    const displayedPin = await evaluate(page, `document.body.innerText.includes(${JSON.stringify(scenario.pin)}) || document.querySelectorAll('button').length > 0`);
    if (!displayedPin) throw new Error('The eight-digit fixture PIN was not displayed before login');
    const loginInteractionStartedAt = await evaluate(page, 'performance.now()');
    await clickButtonByText(page, scenario.loginText);
    try {
      await waitForBrowserCondition(page, `document.body.innerText.includes(${JSON.stringify(scenario.expectedText)})`, 45_000, 50);
    } catch (error) {
      const diagnostic = await evaluate(page, `({ href: location.href, title: document.title, body: document.body?.innerText?.slice(0, 1200) || '', localStorage: Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes('view') || key.includes('session') || key.includes('garage'))) })`);
      throw new Error(`${error.message}; authenticated page=${JSON.stringify(diagnostic)}`);
    }
    const loginToDashboardMs = await evaluate(page, `performance.now() - ${JSON.stringify(loginInteractionStartedAt)}`);
    await sleep(500);
    const result = await evaluate(page, `(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const apiResources = resources.filter((resource) => {
        try { return new URL(resource.name).pathname.startsWith('/api/'); } catch { return false; }
      });
      const pathOf = (resource) => {
        try { return new URL(resource.name).pathname; } catch { return resource.name; }
      };
      const diagnostics = typeof window.__RQ_FIRESTORE_LISTENER_DIAGNOSTICS__ === 'function'
        ? window.__RQ_FIRESTORE_LISTENER_DIAGNOSTICS__()
        : null;
      const activeListenersByKey = diagnostics?.activeListenersByKey ?? null;
      const firestoreListenerKeys = activeListenersByKey
        ? Object.fromEntries(Object.entries(activeListenersByKey).filter(([key]) => key !== 'system_config_worker_api'))
        : null;
      const firestoreListenerCount = firestoreListenerKeys
        ? Object.values(firestoreListenerKeys).reduce((total, count) => total + count, 0)
        : null;
      return {
        url: location.href,
        title: document.title,
        role: ${JSON.stringify(role)},
        authenticatedMarker: document.body.innerText.includes(${JSON.stringify(scenario.expectedText)}),
        domNodes: document.getElementsByTagName('*').length,
        scrollHeight: document.documentElement.scrollHeight,
        navigation: nav ? { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd } : null,
        network: {
          completedResourceCount: resources.length,
          completedApiRequestCount: apiResources.length,
          completedApiRequests: apiResources.map((resource) => ({ path: pathOf(resource), durationMs: resource.duration, transferSize: resource.transferSize })),
          totalTransferSize: resources.reduce((total, resource) => total + (resource.transferSize || 0), 0),
        },
        firestoreListenerCount,
        firestoreListenerKeys,
        nonFirestoreTrackedSubscriptions: activeListenersByKey?.system_config_worker_api ?? null,
        listenerTrackerTelemetry: diagnostics?.telemetry ?? null,
      };
    })()`);
    result.loginToDashboardMs = loginToDashboardMs;
    if (role === 'garage' && result.firestoreListenerCount === null) {
      throw new Error('Garage fixture listener diagnostics are unavailable; refusing to record an incomplete baseline');
    }
    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const outputName = scenario.output.replace('mobile', viewportName);
    await writeFile(join(outputDir, `${outputName}.png`), Buffer.from(screenshot.data, 'base64'));
    await writeFile(join(outputDir, `${outputName}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), browser: version.Browser, viewport: { width: viewport.width, height: viewport.height }, fixture: `ui-fixture-${role}`, result }, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    page.close();
    browserCdp.close();
  } finally {
    await Promise.all([browser, server, emulator].map(child => stopProcessTree(child)));
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error.stack || error); process.exit(1); });
