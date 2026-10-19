#!/usr/bin/env node
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outputDir = resolve(process.env.RQ_BASELINE_DIR || join(root, 'docs/ui-opt-01-baseline'));
const port = Number(process.env.RQ_BASELINE_PORT || 4173);
const debugPort = Number(process.env.RQ_BASELINE_DEBUG_PORT || 9223);
const baseUrl = `http://127.0.0.1:${port}`;
const update = process.argv.includes('--update');
const compare = process.argv.includes('--compare');
const keepBrowser = process.argv.includes('--keep-browser');

const cases = [
  { id: 'login', route: '/', view: 'login' },
  { id: 'admin-login', route: '/#/admin', view: 'admin_login' },
  { id: 'delegate-login', route: '/', view: 'delegate_login' },
  { id: 'garage-dashboard', route: '/', view: 'garage' },
  { id: 'admin-dashboard', route: '/', view: 'admin_dashboard' },
  { id: 'delegate-dashboard', route: '/', view: 'delegate_dashboard' },
  { id: 'recharge-history-financial', route: '/', view: 'garage' }
];
const themes = ['light', 'dark'];
const languages = ['ar', 'en'];
const viewports = [
  { id: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
  { id: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }
];

const cdpScript = `(() => {
  window.__rqBaseline = { longTasks: [], layoutShifts: [], events: [], reactCommits: 0, reactRenderers: 0, shimmerSamples: [] };
  const state = window.__rqBaseline;
  try {
    new PerformanceObserver(list => state.longTasks.push(...list.getEntries().map(e => ({ duration: e.duration, startTime: e.startTime })))).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver(list => state.layoutShifts.push(...list.getEntries().filter(e => !e.hadRecentInput).map(e => ({ value: e.value, startTime: e.startTime })))).observe({ type: 'layout-shift', buffered: true });
  } catch {}
  try {
    new PerformanceObserver(list => state.events.push(...list.getEntries().filter(e => e.name !== 'pointerover').map(e => ({ name: e.name, duration: e.duration, startTime: e.startTime })))).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {}
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || { supportsFiber: true, renderers: new Map(), onCommitFiberRoot() {}, onCommitFiberUnmount() {} };
  const originalInject = hook.inject;
  hook.inject = renderer => { state.reactRenderers += 1; return originalInject ? originalInject.call(hook, renderer) : state.reactRenderers; };
  const originalCommit = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = (...args) => { state.reactCommits += 1; return originalCommit.apply(hook, args); };
})();`;

function run(command, args, options = {}) {
  return spawn(command, args, { cwd: root, stdio: options.stdio || 'pipe', env: { ...process.env, ...options.env } });
}

async function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let messageId = 0;
function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const ready = new Promise((resolveReady, reject) => {
    socket.addEventListener('open', () => resolveReady());
    socket.addEventListener('error', reject);
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePending, reject: rejectPending } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectPending(new Error(message.error.message)); else resolvePending(message.result);
    }
  });
  const send = async (method, params = {}) => {
    await ready;
    const id = ++messageId;
    return new Promise((resolvePending, rejectPending) => {
      pending.set(id, { resolve: resolvePending, reject: rejectPending });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  return { send, close: () => socket.close() };
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

function hash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function fileStem(item) { return `${item.item.id}-${item.theme}-${item.language}-${item.viewport.id}`; }

async function main() {
  if (update) await mkdir(outputDir, { recursive: true });
  const server = run('npm', ['run', 'dev'], { env: { PORT: String(port) } });
  let browser;
  const userDataDir = join(tmpdir(), `rq-browser-baseline-${process.pid}`);
  try {
    await waitFor(`${baseUrl}/`);
    browser = run('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, 'about:blank']);
    await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
    const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
    const cdp = connectCdp(version.webSocketDebuggerUrl);
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    const page = connectCdp(target.webSocketDebuggerUrl);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Performance.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: cdpScript });
    const results = [];
    for (const item of cases.flatMap(item => themes.flatMap(theme => languages.flatMap(language => viewports.map(viewport => ({ item, theme, language, viewport })) )))) {
      const stem = fileStem(item);
      await page.send('Emulation.setDeviceMetricsOverride', { width: item.viewport.width, height: item.viewport.height, deviceScaleFactor: item.viewport.deviceScaleFactor, mobile: item.viewport.id === 'mobile' });
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await page.send('Page.navigate', { url: `${baseUrl}${item.item.route}` });
      await sleep(250);
      try {
        await evaluate(page, `localStorage.clear(); localStorage.setItem('app_version','1.0.4'); localStorage.setItem('theme',${JSON.stringify(item.theme)}); localStorage.setItem('admin_lang',${JSON.stringify(item.language)}); localStorage.setItem('app_view',${JSON.stringify(item.item.view)}); location.reload();`);
      } catch (error) {
        // A protected synthetic view may redirect while the previous document is
        // still settling. Re-open the origin and continue with a recorded probe.
        console.warn(`setup recovered for ${stem}: ${error.message}`);
        await page.send('Page.navigate', { url: `${baseUrl}${item.item.route}?rqBaselineRetry=1` });
        await sleep(900);
      }
      await sleep(900);
      await evaluate(page, `document.documentElement.dir=${JSON.stringify(item.language === 'ar' ? 'rtl' : 'ltr')}; window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - innerHeight)); window.scrollTo(0, 0);`);
      await sleep(300);
      const metrics = await evaluate(page, `(() => { const nav = performance.getEntriesByType('navigation')[0]; const resources = performance.getEntriesByType('resource'); const state = window.__rqBaseline || {}; const js = resources.filter(r => r.initiatorType === 'script' || /\\.js(?:$|\\?)/.test(r.name)); const shimmer = [...document.querySelectorAll('[class*="shimmer"], [class*="border-shimmer"], svg')].filter(el => getComputedStyle(el).animationName !== 'none').length; return { url: location.href, title: document.title, dir: document.documentElement.dir, theme: document.documentElement.className, domNodes: document.getElementsByTagName('*').length, scrollHeight: document.documentElement.scrollHeight, viewport: { width: innerWidth, height: innerHeight }, navigation: nav && { domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd, responseEnd: nav.responseEnd, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize }, javascript: { resources: js.length, transferSize: js.reduce((n,r) => n + (r.transferSize || 0), 0), duration: js.reduce((n,r) => n + r.duration, 0) }, longTasks: state.longTasks, layoutShifts: state.layoutShifts, interactionEvents: state.events, react: { commits: state.reactCommits, renderers: state.reactRenderers }, memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null, activeAnimations: shimmer, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
      const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const png = Buffer.from(screenshot.data, 'base64');
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const accessibility = await evaluate(page, `(() => { document.documentElement.style.fontSize = '125%'; return { reducedMotionHonored: matchMedia('(prefers-reduced-motion: reduce)').matches, largeFontScrollHeight: document.documentElement.scrollHeight, largeFontDomNodes: document.getElementsByTagName('*').length }; })()`);
      await evaluate(page, `document.documentElement.style.fontSize = '';`);
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      const screenshotPath = join(outputDir, `${stem}.png`);
      const manifestPath = join(outputDir, `${stem}.json`);
      const record = { ...item, screenshot: screenshotPath, screenshotSha256: hash(png), metrics, accessibility, assumptions: { browser: version.Browser, userAgent: version['User-Agent'], deviceScaleFactor: item.viewport.deviceScaleFactor, syntheticFixture: true, firestoreWrites: false } };
      if (update) { await writeFile(screenshotPath, png); await writeFile(manifestPath, `${JSON.stringify(record, null, 2)}\n`); }
      results.push(record);
      process.stdout.write(`captured ${stem} nodes=${metrics.domNodes} load=${Math.round(metrics.navigation?.loadEvent || 0)}ms\n`);
    }
    const summary = { generatedAt: new Date().toISOString(), command: `node tools/browser-baseline.mjs${update ? ' --update' : ''}`, cases: results, notes: ['Protected views are measured with synthetic localStorage view fixtures; no Firestore writes are performed.', 'A React commit count is reported only when the React DevTools hook is available before app bootstrap.', 'Use the PNG files for visual review; hashes provide an exact regression signal under identical browser/rendering conditions.'] };
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    if (compare && !update) {
      const failures = [];
      for (const record of results) {
        try { const baseline = await readFile(record.screenshot); if (hash(baseline) !== record.screenshotSha256) failures.push(record.screenshot); } catch { failures.push(record.screenshot); }
      }
      if (failures.length) throw new Error(`Visual baseline mismatch or missing baseline: ${failures.length} screenshot(s)`);
    }
    await page.send('Browser.close').catch(() => {}); page.close(); cdp.close();
  } finally {
    if (!keepBrowser && browser) browser.kill('SIGTERM');
    server.kill('SIGTERM');
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
