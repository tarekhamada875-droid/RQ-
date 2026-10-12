import crypto from 'node:crypto';

const PROJECT_ID = 'rq-hono-preview-isolated';
const DATABASE_ID = '(default)';
const WORKER_URL = 'https://rq-hono-preview.tarekhamada875.workers.dev';
const PAGES_ORIGIN = 'https://migration-unified-hono.rq-acg.pages.dev';
const API_KEY = 'AIzaSyCsVlo9gmyTbGBIUFOLkCUsuQBnpFwIq8I';
const REHEARSAL_DATE = '2026-10-12';
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
if (serviceAccount.project_id !== PROJECT_ID) {
  throw new Error('REFUSE: service account is not scoped to isolated preview project');
}
if (!serviceAccount.client_email || !serviceAccount.private_key) {
  throw new Error('Missing isolated service-account fields');
}

const runId = process.env.GITHUB_RUN_ID || `${Date.now()}`;
const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';
const suffix = crypto.randomBytes(4).toString('hex');
const garageId = `h9-projection-20261012-${runId}-${attempt}-${suffix}`;
const uid = `h9-projection-admin-${runId}-${attempt}`;
const root = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const garagePath = `garages/${garageId}`;
const statsPath = `${garagePath}/daily_stats/${REHEARSAL_DATE}`;
const eventPaths = ['entry', 'exit', 'refund', 'before-day', 'next-day'].map((id) => `${garagePath}/events/${id}`);
const paths = [garagePath, statsPath, ...eventPaths];

const b64 = (value) => Buffer.from(value).toString('base64url');
const signJwt = (payload) => {
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signature = crypto.createSign('RSA-SHA256').update(input).sign(serviceAccount.private_key, 'base64url');
  return `${input}.${signature}`;
};
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 900
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed: ${response.status}`);
  return (await response.json()).access_token;
}
const token = await accessToken();
const firestoreUrl = (path) => `${root}/${path.split('/').map(encodeURIComponent).join('/')}`;
async function firestore(path, init = {}) {
  const response = await fetch(firestoreUrl(path), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${init.method || 'GET'} ${path} failed: ${response.status}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const encodeValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeValue(child)])) } };
};
const encodeDocument = (data) => ({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])) });
const decodeValue = (value) => {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decodeValue(child)]));
  return undefined;
};
const decodeDocument = (document) => Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
function cairoMidnightUtc(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetLocalAsUtc;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]));
    const displayedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const correction = targetLocalAsUtc - displayedAsUtc;
    if (correction === 0) break;
    guess += correction;
  }
  return new Date(guess);
}
function dateIsValid(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateKey;
}
const dayStart = cairoMidnightUtc(REHEARSAL_DATE);
const eventAt = (offsetMs) => new Date(dayStart.getTime() + offsetMs).toISOString();
const fixture = {
  [garagePath]: { name: `Synthetic H9 projection rehearsal ${runId}`, status: 'active' },
  [statsPath]: { count: 999, revenue: 999, preservedField: 'h9-projection-rollback-sentinel' },
  [`${garagePath}/events/entry`]: {
    occurredAt: eventAt(60_000), eventId: 'entry-event', eventType: 'vehicle_entered'
  },
  [`${garagePath}/events/exit`]: {
    occurredAt: eventAt(120_000), eventId: 'exit-event', eventType: 'vehicle_exited', payload: { cost: 50 }
  },
  [`${garagePath}/events/refund`]: {
    occurredAt: eventAt(180_000), eventType: 'vehicle_refunded', payload: { refundAmount: 5 }
  },
  [`${garagePath}/events/before-day`]: {
    occurredAt: new Date(dayStart.getTime() - 1).toISOString(), eventType: 'vehicle_entered'
  },
  [`${garagePath}/events/next-day`]: {
    occurredAt: new Date(cairoMidnightUtc('2026-10-13').getTime()).toISOString(), eventType: 'vehicle_entered'
  }
};

const initialSnapshot = new Map();
for (const path of paths) initialSnapshot.set(path, await firestore(path));
if ([...initialSnapshot.values()].some(Boolean)) throw new Error('REFUSE: unique synthetic rehearsal path already exists');
if (!dateIsValid(REHEARSAL_DATE)) throw new Error('Invalid fixed Cairo rehearsal date');

let failure;
let expectedProjection;
let idToken;
try {
  const [healthResponse, versionResponse] = await Promise.all([
    fetch(`${WORKER_URL}/api/health`, { signal: AbortSignal.timeout(20_000) }),
    fetch(`${WORKER_URL}/api/version`, { signal: AbortSignal.timeout(20_000) })
  ]);
  if (!healthResponse.ok || !versionResponse.ok) throw new Error('REFUSE: isolated preview health/version preflight failed');
  const health = await healthResponse.json();
  const version = await versionResponse.json();
  if (health.environment !== 'preproduction' || health.runtime !== 'cloudflare-worker' || version.environment !== 'preproduction' || version.version !== '1.0.0-h5-preview') {
    throw new Error('REFUSE: Worker preflight did not report the expected preproduction runtime');
  }

  for (const [path, data] of Object.entries(fixture)) {
    await firestore(path, { method: 'PATCH', body: JSON.stringify(encodeDocument(data)) });
  }
  const seededPaths = await Promise.all(paths.map(async (path) => ({ pathType: path.includes('/events/') ? 'event' : path.includes('/daily_stats/') ? 'daily_stats' : 'garage', exists: Boolean(await firestore(path)) })));
  if (seededPaths.some(({ exists }) => !exists)) throw new Error('Synthetic fixture seed verification failed');

  const now = Math.floor(Date.now() / 1000);
  const customToken = signJwt({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 600,
    uid,
    claims: { role: 'admin' }
  });
  const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!authResponse.ok) {
    const authError = await authResponse.json().catch(() => ({}));
    throw new Error(`Isolated Auth custom-token exchange failed: ${authResponse.status}:${authError?.error?.message || 'unknown'}`);
  }
  idToken = (await authResponse.json()).idToken;
  const routeBody = { garageId, date: REHEARSAL_DATE };
  const rebuildResponse = await fetch(`${WORKER_URL}/api/garages/rebuild-projections`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
      origin: PAGES_ORIGIN
    },
    body: JSON.stringify(routeBody),
    signal: AbortSignal.timeout(45_000)
  });
  const result = await rebuildResponse.json();
  const projection = result?.data?.projection;
  expectedProjection = {
    count: 1,
    exitsCount: 1,
    grossRevenue: 50,
    refundRevenue: 5,
    netRevenue: 45,
    revenue: 45,
    rebuiltBy: uid,
    eventWatermark: {
      lastProcessedOccurredAt: eventAt(180_000),
      lastProcessedEventId: 'refund',
      projectionVersion: 1
    }
  };
  if (!rebuildResponse.ok || result?.success !== true || result?.data?.garageId !== garageId || result?.data?.date !== REHEARSAL_DATE) {
    throw new Error(`Hono rebuild failed: HTTP ${rebuildResponse.status}`);
  }
  for (const [key, expected] of Object.entries(expectedProjection)) {
    if (JSON.stringify(projection?.[key]) !== JSON.stringify(expected)) throw new Error(`Projection response mismatch for ${key}`);
  }
  if (projection?.preservedField !== undefined) throw new Error('Projection response unexpectedly includes an unrelated sentinel field');
  const persisted = decodeDocument(await firestore(statsPath));
  for (const [key, expected] of Object.entries(expectedProjection)) {
    if (JSON.stringify(persisted?.[key]) !== JSON.stringify(expected)) throw new Error(`Persisted projection mismatch for ${key}`);
  }
  if (persisted?.preservedField !== 'h9-projection-rollback-sentinel') throw new Error('Merge did not preserve the sentinel field');
  console.log(JSON.stringify({ rehearsal: 'route-pass', route: '/api/garages/rebuild-projections', date: REHEARSAL_DATE, eventCount: 3, expected: expectedProjection }));
} catch (error) {
  failure = error;
} finally {
  const rollbackErrors = [];
  try {
    for (const path of [...paths].reverse()) await firestore(path, { method: 'DELETE' });
    const restored = await Promise.all(paths.map(async (path) => ({ path, value: await firestore(path) })));
    if (restored.some(({ value }) => value !== null)) throw new Error('Rollback verification failed: at least one synthetic path remains');
  } catch (rollbackError) {
    rollbackErrors.push(rollbackError.message);
  }
  if (idToken) {
    try {
      const deleteAuth = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(20_000)
      });
      if (!deleteAuth.ok) throw new Error(`Temporary Auth identity delete failed: ${deleteAuth.status}`);
    } catch (authCleanupError) {
      rollbackErrors.push(authCleanupError.message);
    }
  }
  if (rollbackErrors.length) {
    console.error(JSON.stringify({ rollback: 'FAIL', project: PROJECT_ID, database: DATABASE_ID, errors: rollbackErrors }));
    failure = new Error(`${failure ? `${failure.message}; ` : ''}${rollbackErrors.join('; ')}`);
  } else {
    console.log(JSON.stringify({ rollback: 'PASS', project: PROJECT_ID, database: DATABASE_ID, restoredOriginallyAbsentPaths: paths.length, temporaryAuthIdentityDeleted: Boolean(idToken) }));
  }
}

if (failure) {
  console.error(JSON.stringify({ rehearsal: 'FAIL', route: '/api/garages/rebuild-projections', message: failure.message }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'PASS', project: PROJECT_ID, database: DATABASE_ID, garageId, route: '/api/garages/rebuild-projections', date: REHEARSAL_DATE }));
}
