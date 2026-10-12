import crypto from 'node:crypto';

const PROJECT_ID = 'rq-hono-preview-isolated';
const DATABASE_ID = '(default)';
const WORKER_URL = 'https://rq-hono-preview.tarekhamada875.workers.dev';
const API_KEY = 'AIzaSyCsVlo9gmyTbGBIUFOLkCUsuQBnpFwIq8I';
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
if (serviceAccount.project_id !== PROJECT_ID) throw new Error('REFUSE: service account is not scoped to isolated preview project');
if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Missing isolated service-account fields');

const dateId = process.env.REHEARSAL_DATE || '2026-10-12';
const runId = `h9-summary-${Date.now()}`;
const garageId = `${runId}-garage`;
const uid = `${runId}-admin`;
const root = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const paths = [
  `garages/${garageId}`,
  `garages/${garageId}/daily_stats/${dateId}`,
  `garages/${garageId}/projection_buckets/shard-a`,
  `garages/${garageId}/projection_buckets/shard-b`,
  `garages/${garageId}/projection_buckets/other-day`,
  `garages/${garageId}/events/enter`,
  `garages/${garageId}/events/exit`,
  `garages/${garageId}/events/refund`,
  `garages/${garageId}/events/before-day`,
  `garages/${garageId}/events/next-day`,
  `garages/${garageId}/dashboard_summary/current`,
];

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
  const assertion = signJwt({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 900 });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!response.ok) throw new Error(`OAuth token exchange failed: ${response.status}`);
  return (await response.json()).access_token;
}
const token = await accessToken();
const firestoreUrl = (path) => `https://firestore.googleapis.com/v1/${root}/${path.split('/').map(encodeURIComponent).join('/')}`;
async function firestore(path, init = {}) {
  const response = await fetch(firestoreUrl(path), { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${init.method || 'GET'} ${path} failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function rawRunQuery(parent, collectionId, bodyParent, where, orderBy) {
  const structuredQuery = { from: [{ collectionId }] };
  if (where) structuredQuery.where = where;
  if (orderBy) structuredQuery.orderBy = [orderBy];
  const endpoint = bodyParent ? `${root}:runQuery` : `${parent}:runQuery`;
  const body = bodyParent ? { parent, structuredQuery } : { structuredQuery };
  const response = await fetch(`https://firestore.googleapis.com/v1/${endpoint}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) return { status: response.status, count: -1 };
  const rows = await response.json();
  return { status: response.status, count: rows.filter((row) => row.document).length };
}
const value = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, child]) => [k, value(child)])) } };
};
const document = (data) => ({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)])) });
const snapshot = new Map();
for (const path of paths) snapshot.set(path, await firestore(path));
if ([...snapshot.values()].some(Boolean)) throw new Error('REFUSE: synthetic rehearsal path already exists');
const fixture = {
  [`garages/${garageId}`]: { carsInside: 2 },
  [`garages/${garageId}/daily_stats/${dateId}`]: { count: 1, revenue: 15 },
  [`garages/${garageId}/projection_buckets/shard-a`]: { dateId, activeVehicleCount: 2, entriesToday: 1, exitsToday: 1, grossRevenue: 20, refundTotal: 5, netRevenue: 15 },
  [`garages/${garageId}/projection_buckets/shard-b`]: { dateId, activeVehicleCount: 1, entriesToday: 0, exitsToday: 0, grossRevenue: 0, refundTotal: 0, netRevenue: 0 },
  [`garages/${garageId}/projection_buckets/other-day`]: { dateId: '2026-10-11', activeVehicleCount: 100, entriesToday: 100 },
  [`garages/${garageId}/events/enter`]: { occurredAt: '2026-10-11T21:30:00.000Z', eventType: 'vehicle_entered' },
  [`garages/${garageId}/events/exit`]: { occurredAt: '2026-10-11T21:31:00.000Z', eventType: 'vehicle_exited', payload: { cost: 20 } },
  [`garages/${garageId}/events/refund`]: { occurredAt: '2026-10-11T21:32:00.000Z', eventType: 'vehicle_refunded', payload: { refundAmount: 5 } },
  [`garages/${garageId}/events/before-day`]: { occurredAt: '2026-10-11T20:59:59.000Z', eventType: 'vehicle_entered' },
  [`garages/${garageId}/events/next-day`]: { occurredAt: '2026-10-12T21:00:00.000Z', eventType: 'vehicle_entered' },
};
try {
  for (const [path, data] of Object.entries(fixture)) await firestore(path, { method: 'PATCH', body: JSON.stringify(document(data)) });
  const seededPresence = await Promise.all(Object.keys(fixture).map(async (path) => ({ pathType: path.includes('/events/') ? 'event' : path.includes('/projection_buckets/') ? 'bucket' : path.includes('/daily_stats/') ? 'daily_stats' : 'garage', exists: Boolean(await firestore(path)) })));
  console.log(JSON.stringify({ seededPresence }));
  const bucketParent = `${root}/garages/${garageId}`;
  console.log(JSON.stringify({ queryShape: { bodyParent: await rawRunQuery(bucketParent, 'projection_buckets', true), endpointParent: await rawRunQuery(bucketParent, 'projection_buckets', false) } }));
  const eventWhere = { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'occurredAt' }, op: 'GREATER_THAN_OR_EQUAL', value: value('2026-10-11T21:00:00.000Z') } },
    { fieldFilter: { field: { fieldPath: 'occurredAt' }, op: 'LESS_THAN', value: value('2026-10-12T21:00:00.000Z') } }
  ] } };
  console.log(JSON.stringify({ eventQuery: { endpointParent: await rawRunQuery(bucketParent, 'events', false, eventWhere, { field: { fieldPath: 'occurredAt' }, direction: 'ASCENDING' }) } }));
  const now = Math.floor(Date.now() / 1000);
  const customToken = signJwt({ iss: serviceAccount.client_email, sub: serviceAccount.client_email, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 600, uid, claims: { role: 'admin' } });
  const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  if (!authResponse.ok) {
    const authError = await authResponse.json().catch(() => ({}));
    throw new Error(`Isolated Auth custom-token exchange failed: ${authResponse.status}:${authError?.error?.message || 'unknown'}`);
  }
  const idToken = (await authResponse.json()).idToken;
  const rebuild = await fetch(`${WORKER_URL}/api/garages/dashboard-summary/rebuild`, { method: 'POST', headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json', origin: 'https://migration-unified-hono.rq-acg.pages.dev' }, body: JSON.stringify({ garageId, date: dateId }) });
  const result = await rebuild.json();
  if (!rebuild.ok || result?.success !== true) throw new Error(`Hono rebuild failed: HTTP ${rebuild.status}`);
  const summary = result.data?.summary;
  console.log(JSON.stringify({ observed: { bucketCount: result.data?.bucketCount, eventCount: result.data?.eventCount, summary: { dateId: summary?.dateId, activeVehicleCount: summary?.activeVehicleCount, entriesToday: summary?.entriesToday, exitsToday: summary?.exitsToday, grossRevenue: summary?.grossRevenue, refundTotal: summary?.refundTotal, netRevenue: summary?.netRevenue, eventProjection: summary?.eventProjection, reconciliation: summary?.reconciliation } } }));
  console.log(JSON.stringify({ checks: { bucketCount: result.data?.bucketCount === 2, eventCount: result.data?.eventCount === 3, date: summary?.dateId === dateId, active: summary?.activeVehicleCount === 3, entries: summary?.entriesToday === 1, gross: summary?.grossRevenue === 20, refund: summary?.refundTotal === 5, net: summary?.netRevenue === 15, eventProjectionCount: summary?.eventProjection?.count === 1, eventProjectionExits: summary?.eventProjection?.exitsCount === 1, consistent: summary?.reconciliation?.consistent === true } }));
  if (result.data.bucketCount !== 2 || result.data.eventCount !== 3 || summary?.dateId !== dateId || summary?.activeVehicleCount !== 3 || summary?.entriesToday !== 1 || summary?.grossRevenue !== 20 || summary?.refundTotal !== 5 || summary?.netRevenue !== 15 || summary?.eventProjection?.count !== 1 || summary?.eventProjection?.exitsCount !== 1 || summary?.reconciliation?.consistent !== true) throw new Error('Rebuild result did not match the synthetic Cairo-day expectations');
  const persisted = await firestore(`garages/${garageId}/dashboard_summary/current`);
  if (!persisted) throw new Error('Persisted dashboard summary was not found');
  console.log(JSON.stringify({ status: 'PASS', project: PROJECT_ID, database: DATABASE_ID, route: '/api/garages/dashboard-summary/rebuild', bucketCount: result.data.bucketCount, eventCount: result.data.eventCount, consistentWithEvents: result.data.consistentWithEvents, syntheticRecordCount: Object.keys(fixture).length + 1 }));
} finally {
  for (const path of paths) {
    const original = snapshot.get(path);
    if (original) await firestore(path, { method: 'PATCH', body: JSON.stringify(original) });
    else await firestore(path, { method: 'DELETE' });
  }
  for (const path of paths) {
    const after = await firestore(path);
    if (snapshot.get(path) ? JSON.stringify(after) !== JSON.stringify(snapshot.get(path)) : after !== null) throw new Error(`Rollback verification failed for ${path}`);
  }
  console.log(JSON.stringify({ rollback: 'PASS', project: PROJECT_ID, database: DATABASE_ID }));
}
