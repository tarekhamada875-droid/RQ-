type WorkerEnv = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
};

type JsonMap = Record<string, unknown>;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const DEFAULT_PROJECT = 'gen-lang-client-0091669619';
const DEFAULT_DATABASE = 'ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759';
const googleCertsUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let config: { projectId: string; databaseId: string; serviceAccount?: ServiceAccount } = {
  projectId: DEFAULT_PROJECT,
  databaseId: DEFAULT_DATABASE
};
let activeDb: FirestoreRest | null = null;
let activeAuth: FirebaseAuthRest | null = null;
let accessTokenCache: { token: string; expiresAt: number } | null = null;
let certCache: { expiresAt: number; keys: Record<string, JsonMap> } | null = null;

function base64Url(value: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importPrivateKey(privateKey: string): Promise<CryptoKey> {
  const pem = privateKey.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  return crypto.subtle.importKey('pkcs8', fromBase64Url(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function signedJwt(header: JsonMap, payload: JsonMap, key: CryptoKey): Promise<string> {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.token;
  if (!config.serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  const now = Math.floor(Date.now() / 1000);
  const key = await importPrivateKey(config.serviceAccount.private_key);
  const assertion = await signedJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: config.serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: config.serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    key
  );
  const response = await fetch(config.serviceAccount.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error(`FIREBASE_ACCESS_TOKEN_FAILED:${response.status}`);
  const body = await response.json() as { access_token: string; expires_in?: number };
  accessTokenCache = { token: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in || 3600) * 1000 };
  return body.access_token;
}

async function firestoreRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', 'application/json');
  return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers });
}

function encodeValue(value: unknown): JsonMap {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object' && value && '__op' in value) {
    const op = (value as { __op: string; value?: unknown }).__op;
    if (op === 'increment') return { doubleValue: Number((value as unknown as { value: unknown }).value || 0) };
  }
  if (typeof value === 'object') {
    const fields: JsonMap = {};
    for (const [key, child] of Object.entries(value as JsonMap)) fields[key] = encodeValue(child);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeValue(value: any): any {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decodeValue(child)]));
  return value;
}

function decodeDocument(raw: any): JsonMap {
  return Object.fromEntries(Object.entries(raw?.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

class DocumentSnapshot {
  constructor(public readonly raw: any) {}
  get exists(): boolean { return !!this.raw; }
  get id(): string { return String(this.raw?.name || '').split('/').pop() || ''; }
  data(): JsonMap | undefined { return this.raw ? decodeDocument(this.raw) : undefined; }
  get ref(): DocumentReference { return new DocumentReference(String(this.raw?.name || '')); }
}

class DocumentReference {
  readonly id: string;
  constructor(public readonly name: string) { this.id = name.split('/').pop() || ''; }
  async get(): Promise<DocumentSnapshot> { return new DocumentSnapshot(await activeDb!.getDocument(this.name)); }
  async set(data: JsonMap, options?: { merge?: boolean }): Promise<void> { await activeDb!.write([{ reference: this.name, data, method: options?.merge ? 'update' : 'set' }]); }
  async update(data: JsonMap): Promise<void> { await activeDb!.write([{ reference: this.name, data, method: 'update' }]); }
  async delete(): Promise<void> { await activeDb!.write([{ reference: this.name, data: {}, method: 'delete' }]); }
}

class QueryReference {
  constructor(public readonly collectionPath: string, public readonly filters: Array<{ field: string; op: string; value: unknown }> = [], public readonly maxResults?: number, public readonly sort?: { field: string; direction: string }, public readonly allDescendants = false) {}
  where(field: string, op: string, value: unknown): QueryReference { return new QueryReference(this.collectionPath, [...this.filters, { field, op, value }], this.maxResults, this.sort, this.allDescendants); }
  limit(value: number): QueryReference { return new QueryReference(this.collectionPath, this.filters, value, this.sort, this.allDescendants); }
  orderBy(field: string, direction = 'asc'): QueryReference { return new QueryReference(this.collectionPath, this.filters, this.maxResults, { field, direction }, this.allDescendants); }
  async get(): Promise<{ empty: boolean; docs: DocumentSnapshot[] }> { const docs = await activeDb!.query(this); return { empty: docs.length === 0, docs: docs.map((raw) => new DocumentSnapshot(raw)) }; }
}

class CollectionReference extends QueryReference {
  doc(id?: string): DocumentReference { return new DocumentReference(`${activeDb!.documentsRoot}/${this.collectionPath}/${id || crypto.randomUUID()}`); }
}

class FirestoreBatch {
  protected writes: Array<{ reference: string; data: JsonMap; method: string }> = [];
  set(ref: DocumentReference, data: JsonMap, options?: { merge?: boolean }): this { this.writes.push({ reference: ref.name, data, method: options?.merge ? 'update' : 'set' }); return this; }
  update(ref: DocumentReference, data: JsonMap): this { this.writes.push({ reference: ref.name, data, method: 'update' }); return this; }
  delete(ref: DocumentReference): this { this.writes.push({ reference: ref.name, data: {}, method: 'delete' }); return this; }
  async commit(): Promise<void> { await activeDb!.write(this.writes); }
}

class FirestoreTransaction extends FirestoreBatch {
  constructor(private readonly transactionId: string) { super(); }
  async get(ref: DocumentReference): Promise<DocumentSnapshot> { return new DocumentSnapshot(await activeDb!.getDocument(ref.name, this.transactionId)); }
  get id(): string { return this.transactionId; }
  get pendingWrites(): Array<{ reference: string; data: JsonMap; method: string }> { return this.writes; }
}

class FirestoreRest {
  readonly documentsRoot: string;
  constructor(public readonly projectId: string, public readonly databaseId: string) { this.documentsRoot = `projects/${projectId}/databases/${databaseId}/documents`; }
  doc(path: string): DocumentReference { return new DocumentReference(`${this.documentsRoot}/${path}`); }
  collection(path: string): CollectionReference { return new CollectionReference(path); }
  collectionGroup(path: string): QueryReference { return new QueryReference(path, [], undefined, undefined, true); }
  batch(): FirestoreBatch { return new FirestoreBatch(); }
  async runTransaction(callback: (transaction: FirestoreTransaction) => Promise<void>): Promise<void> {
    const begin = await firestoreRequest(`${this.documentsRoot}:beginTransaction`, { method: 'POST', body: JSON.stringify({ options: { readWrite: {} } }) });
    if (!begin.ok) throw new Error(`FIRESTORE_TRANSACTION_BEGIN_FAILED:${begin.status}`);
    const { transaction } = await begin.json() as { transaction: string };
    const tx = new FirestoreTransaction(transaction);
    try {
      await callback(tx);
      await this.write(tx.pendingWrites, transaction);
    } catch (error) {
      await firestoreRequest(`${this.documentsRoot}:rollback`, { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
      throw error;
    }
  }
  async getDocument(name: string, transaction?: string): Promise<any> {
    if (transaction) {
      const response = await firestoreRequest(`${this.documentsRoot}:batchGet`, { method: 'POST', body: JSON.stringify({ documents: [name], transaction }) });
      if (!response.ok) throw new Error(`FIRESTORE_GET_FAILED:${response.status}`);
      const rows = await response.json() as Array<{ found?: any }>;
      return rows[0]?.found || null;
    }
    const response = await firestoreRequest(name);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`FIRESTORE_GET_FAILED:${response.status}`);
    return response.json();
  }
  async query(query: QueryReference): Promise<any[]> {
    const from: JsonMap = { collectionId: query.collectionPath.split('/').pop() || '', allDescendants: query.allDescendants };
    const structuredQuery: JsonMap = { from: [from] };
    if (query.filters.length === 1) {
      const filter = query.filters[0];
      structuredQuery.where = { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op === '==' ? 'EQUAL' : filter.op === '>=' ? 'GREATER_THAN_OR_EQUAL' : filter.op === '<=' ? 'LESS_THAN_OR_EQUAL' : 'EQUAL', value: encodeValue(filter.value) } };
    } else if (query.filters.length > 1) {
      structuredQuery.where = { compositeFilter: { op: 'AND', filters: query.filters.map((filter) => ({ fieldFilter: { field: { fieldPath: filter.field }, op: filter.op === '==' ? 'EQUAL' : 'EQUAL', value: encodeValue(filter.value) } })) } };
    }
    if (query.sort) structuredQuery.orderBy = [{ field: { fieldPath: query.sort.field }, direction: query.sort.direction.toLowerCase() === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
    if (query.maxResults) structuredQuery.limit = query.maxResults;
    const response = await firestoreRequest(`${this.documentsRoot}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
    if (!response.ok) throw new Error(`FIRESTORE_QUERY_FAILED:${response.status}`);
    const rows = await response.json() as Array<{ document?: any }>;
    return rows.filter((row) => row.document).map((row) => row.document);
  }
  async write(writes: Array<{ reference: string; data: JsonMap; method: string }>, transaction?: string): Promise<void> {
    const body = {
      writes: writes.map((write) => {
        if (write.method === 'delete') return { delete: write.reference };
        const fields: JsonMap = {};
        const transforms: JsonMap[] = [];
        for (const [key, value] of Object.entries(write.data)) {
          if (value && typeof value === 'object' && (value as { __op?: string }).__op === 'increment') {
            transforms.push({ fieldPath: key, increment: encodeValue((value as { value?: unknown }).value || 0) });
          } else {
            fields[key] = encodeValue(value);
          }
        }
        const update: JsonMap = { name: write.reference, fields };
        const result: JsonMap = { update };
        if (write.method === 'update') result.updateMask = { fieldPaths: Object.keys(fields) };
        if (transforms.length) result.updateTransforms = transforms;
        return result;
      }),
      ...(transaction ? { transaction } : {})
    };
    const response = await firestoreRequest(`${this.documentsRoot}:commit`, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`FIRESTORE_WRITE_FAILED:${response.status}`);
  }
}

class FirebaseAuthRest {
  constructor(public readonly projectId: string) {}
  async verifyIdToken(token: string): Promise<any> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('INVALID_TOKEN');
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as { kid: string; alg: string };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as any;
    if (header.alg !== 'RS256' || payload.iss !== `https://securetoken.google.com/${this.projectId}` || payload.aud !== this.projectId || !payload.sub || payload.exp * 1000 <= Date.now()) throw new Error('INVALID_TOKEN');
    const certs = await getGoogleCerts();
    const jwk = certs[header.kid];
    if (!jwk) throw new Error('INVALID_TOKEN_KEY');
    const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error('INVALID_TOKEN_SIGNATURE');
    return payload;
  }
}

async function getGoogleCerts(): Promise<Record<string, JsonMap>> {
  if (certCache && certCache.expiresAt > Date.now()) return certCache.keys;
  const response = await fetch(googleCertsUrl);
  if (!response.ok) throw new Error(`FIREBASE_CERTS_FAILED:${response.status}`);
  const keys = await response.json() as Record<string, JsonMap>;
  const maxAge = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 3600);
  certCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

export const FieldValue = { increment: (value: number) => ({ __op: 'increment', value }) };

export function initializeFirebaseAdmin(env?: WorkerEnv): void {
  const raw = env?.FIREBASE_SERVICE_ACCOUNT_JSON || env?.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount: ServiceAccount | undefined;
  if (raw) {
    try { serviceAccount = JSON.parse(raw) as ServiceAccount; } catch { throw new Error('INVALID_FIREBASE_SERVICE_ACCOUNT_JSON'); }
  }
  config = { projectId: env?.FIREBASE_PROJECT_ID || serviceAccount?.project_id || DEFAULT_PROJECT, databaseId: env?.FIREBASE_DATABASE_ID || DEFAULT_DATABASE, serviceAccount };
  activeDb = new FirestoreRest(config.projectId, config.databaseId);
  activeAuth = new FirebaseAuthRest(config.projectId);
}

export const adminDb: any = new Proxy({}, { get(_target, property) { if (!activeDb) initializeFirebaseAdmin(); const value = (activeDb as any)?.[property]; return typeof value === 'function' ? value.bind(activeDb) : value; } });
export const adminAuth: any = new Proxy({}, { get(_target, property) { if (!activeAuth) initializeFirebaseAdmin(); const value = (activeAuth as any)?.[property]; return typeof value === 'function' ? value.bind(activeAuth) : value; } });
