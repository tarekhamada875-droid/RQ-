export class MockDocumentSnapshot {
  constructor(
    public readonly id: string,
    public readonly exists: boolean,
    private readonly _data?: any,
    public readonly ref?: any
  ) {}

  data() {
    return this._data ? structuredClone(this._data) : undefined;
  }
}

// Audit A1 (Phase 3, 2026-11-06): apply FieldValue.increment transforms
// during mock merge/update writes, mirroring real Firestore semantics.
//
// The real firebase-admin SDK's FieldValue.increment(n) returns a
// NumericIncrementTransform instance (with an `operand` property). The
// worker-side firebaseWorkerAdmin.ts's FieldValue.increment(n) returns
// the sentinel {__op:'increment', value:n}. Both shapes are recognized
// here so the mock works for both dev (real SDK) and the alias-target's
// shape (which never reaches the mock in tests, but is recognized for
// defensive symmetry).
//
// Before this helper, the mock persisted the transform object as a
// literal map — so isUsableMaintainedSummary got NaN and the O(1)
// maintained-summary fast path silently never worked in dev. A test
// (cloudflareWorkerSubscriberRoutes.test.ts:445-448) even papered over
// this by unwrapping __op manually. That workaround is no longer needed.
function applyFieldTransforms(data: any, existing: any): any {
  if (!data || typeof data !== 'object') return data;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isIncrementTransform(value)) {
      const operand = extractIncrementOperand(value);
      const current = Number(existing?.[key] ?? 0);
      result[key] = Number.isFinite(current) ? current + operand : operand;
    } else {
      // Pass through everything else as-is (no recursion — avoids
      // mutating plain nested objects that don't contain transforms).
      result[key] = value;
    }
  }
  return result;
}

function isIncrementTransform(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  // Real SDK shape: NumericIncrementTransform { operand: number }
  // (constructor.name === 'NumericIncrementTransform')
  if (value instanceof Date) return false;
  const ctorName = (value as any)?.constructor?.name;
  if (ctorName === 'NumericIncrementTransform') return true;
  // Worker-shim sentinel shape: { __op: 'increment', value: number }
  if ((value as any)?.__op === 'increment' && typeof (value as any)?.value === 'number') return true;
  return false;
}

function extractIncrementOperand(value: unknown): number {
  const v = value as any;
  if (typeof v?.operand === 'number') return v.operand;
  if (typeof v?.value === 'number') return v.value;
  return 0;
}

export class MockDocumentReference {
  constructor(
    public readonly id: string,
    public readonly path: string,
    private readonly db: MockFirestore
  ) {}

  async get() {
    this.db.documentReadCount += 1;
    const val = this.db.getDocument(this.path);
    return new MockDocumentSnapshot(this.id, val !== undefined, val, this);
  }

  async set(data: any, options?: { merge?: boolean }) {
    this.db.documentWriteCount += 1;
    if (options?.merge) {
      const existing = this.db.records.get(this.path) || {};
      const transformed = applyFieldTransforms(data, existing);
      this.db.records.set(this.path, { ...existing, ...transformed });
    } else {
      this.db.records.set(this.path, data);
    }
  }

  async update(data: any) {
    this.db.documentWriteCount += 1;
    const existing = this.db.records.get(this.path);
    if (existing === undefined) {
      throw new Error(`Document not found: ${this.path}`);
    }
    const transformed = applyFieldTransforms(data, existing);
    this.db.records.set(this.path, { ...existing, ...transformed });
  }

  async delete() {
    this.db.documentWriteCount += 1;
    this.db.records.delete(this.path);
  }

  collection(subPath: string) {
    return this.db.collection(`${this.path}/${subPath}`);
  }
}

export class MockQuery {
  constructor(
    protected readonly db: MockFirestore,
    protected readonly collectionPath: string,
    protected readonly wheres: Array<{ field: string; op: string; value: any }> = [],
    protected readonly limitVal?: number,
    protected readonly isCollectionGroup: boolean = false,
    protected readonly orderings: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
    protected readonly cursor?: any[]
  ) {}

  where(field: string, op: string, value: any) {
    return new MockQuery(
      this.db,
      this.collectionPath,
      [...this.wheres, { field, op, value }],
      this.limitVal,
      this.isCollectionGroup,
      this.orderings,
      this.cursor
    );
  }

  limit(limitVal: number) {
    return new MockQuery(this.db, this.collectionPath, this.wheres, limitVal, this.isCollectionGroup, this.orderings, this.cursor);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new MockQuery(this.db, this.collectionPath, this.wheres, this.limitVal, this.isCollectionGroup, [...this.orderings, { field, direction }], this.cursor);
  }
  startAfter(...values: any[]) {
    return new MockQuery(this.db, this.collectionPath, this.wheres, this.limitVal, this.isCollectionGroup, this.orderings, values);
  }

  async get() {
    let docs: MockDocumentSnapshot[] = [];

    for (const [path, data] of this.db.records.entries()) {
      let match = false;
      if (this.isCollectionGroup) {
        const parts = path.split('/');
        const collectionName = parts[parts.length - 2];
        if (collectionName === this.collectionPath) {
          match = true;
        }
      } else {
        const parts = path.split('/');
        parts.pop();
        const parentPath = parts.join('/');
        if (parentPath === this.collectionPath) {
          match = true;
        }
      }

      if (match) {
        let satisfiesWheres = true;
        for (const w of this.wheres) {
          const actualVal = data[w.field];
          if (w.op === '==') {
            if (actualVal !== w.value) satisfiesWheres = false;
          } else if (w.op === '>=') {
            if (!(actualVal >= w.value)) satisfiesWheres = false;
          } else if (w.op === '<') {
            if (!(actualVal < w.value)) satisfiesWheres = false;
          } else if (w.op === '<=') {
            if (!(actualVal <= w.value)) satisfiesWheres = false;
          } else if (w.op === 'array-contains') {
            if (!Array.isArray(actualVal) || !actualVal.includes(w.value)) satisfiesWheres = false;
          } else if (w.op === 'in') {
            if (!Array.isArray(w.value) || !w.value.includes(actualVal)) satisfiesWheres = false;
          }
        }
        if (satisfiesWheres) {
          const parts = path.split('/');
          const id = parts[parts.length - 1];
          docs.push(new MockDocumentSnapshot(id, true, data, new MockDocumentReference(id, path, this.db)));
        }
      }
    }

    const comparable = (value: any) => value instanceof Date ? value.getTime() : value;
    const compareValues = (left: any, right: any, ordering: { field: string; direction: 'asc' | 'desc' }) => {
      const leftValue = comparable(ordering.field === '__name__' ? left.ref?.path : left.data()?.[ordering.field]);
      const rightValue = comparable(ordering.field === '__name__' ? right.ref?.path : right.data()?.[ordering.field]);
      if (leftValue === rightValue) return 0;
      const comparison = leftValue < rightValue ? -1 : 1;
      return ordering.direction === 'desc' ? -comparison : comparison;
    };
    docs.sort((left, right) => {
      for (const ordering of this.orderings) {
        const comparison = compareValues(left, right, ordering);
        if (comparison) return comparison;
      }
      return 0;
    });
    if (this.cursor && this.orderings.length) {
      docs = docs.filter((doc) => {
        for (let index = 0; index < this.orderings.length; index += 1) {
          const ordering = this.orderings[index];
          const docValue = comparable(ordering.field === '__name__' ? doc.ref?.path : doc.data()?.[ordering.field]);
          const cursorValue = comparable(ordering.field === '__name__' && this.cursor?.[index]?.path
            ? this.cursor[index].path
            : this.cursor?.[index]);
          if (docValue === cursorValue) continue;
          const comparison = docValue < cursorValue ? -1 : 1;
          return ordering.direction === 'asc' ? comparison > 0 : comparison < 0;
        }
        return false;
      });
    }

    if (this.limitVal !== undefined) {
      docs = docs.slice(0, this.limitVal);
    }

    this.db.queryResultSizes.push(docs.length);
    this.db.documentReadCount += Math.max(1, docs.length);

    return {
      size: docs.length,
      empty: docs.length === 0,
      docs
    };
  }
}

export class MockCollectionReference extends MockQuery {
  constructor(
    private readonly _db: MockFirestore,
    private readonly _path: string
  ) {
    super(_db, _path);
  }

  doc(id?: string) {
    const finalId = id || `auto_${Math.random().toString(36).slice(2, 11)}`;
    return new MockDocumentReference(finalId, `${this._path}/${finalId}`, this._db);
  }

  async add(data: any) {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }
}

export class MockBatch {
  private operations: Array<() => Promise<void>> = [];

  constructor(_db?: MockFirestore) {}

  set(ref: MockDocumentReference, data: any, options?: { merge?: boolean }) {
    this.operations.push(() => ref.set(data, options));
  }

  update(ref: MockDocumentReference, data: any) {
    this.operations.push(() => ref.update(data));
  }

  delete(ref: MockDocumentReference) {
    this.operations.push(() => ref.delete());
  }

  async commit() {
    for (const op of this.operations) {
      await op();
    }
  }
}

export class MockFirestore {
  public readonly records = new Map<string, any>();
  public documentReadCount = 0;
  public documentWriteCount = 0;
  public readonly queryResultSizes: number[] = [];
  private readonly virtualDocuments = new Map<string, any>();
  private transactionQueue: Promise<void> = Promise.resolve();

  doc(path: string) {
    const id = path.split('/').at(-1) || '';
    return new MockDocumentReference(id, path, this);
  }

  collection(path: string) {
    return new MockCollectionReference(this, path);
  }

  collectionGroup(path: string) {
    return new MockQuery(this, path, [], undefined, true);
  }

  batch() {
    return new MockBatch(this);
  }

  async runTransaction(callback: (t: any) => Promise<any>) {
    let release!: () => void;
    const previous = this.transactionQueue;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const t = {
        get: async (ref: MockDocumentReference | MockQuery) => ref.get(),
        set: (ref: MockDocumentReference, data: any, options?: { merge?: boolean }) => {
          this.documentWriteCount += 1;
          if (options?.merge) {
            const existing = this.records.get(ref.path) || {};
            const transformed = applyFieldTransforms(data, existing);
            this.records.set(ref.path, { ...existing, ...transformed });
          } else {
            this.records.set(ref.path, data);
          }
        },
        update: (ref: MockDocumentReference, data: any) => {
          this.documentWriteCount += 1;
          const existing = this.records.get(ref.path);
          if (existing === undefined) {
            throw new Error(`Document not found: ${ref.path}`);
          }
          const transformed = applyFieldTransforms(data, existing);
          this.records.set(ref.path, { ...existing, ...transformed });
        },
        delete: (ref: MockDocumentReference) => {
          this.documentWriteCount += 1;
          this.records.delete(ref.path);
        }
      };
      return await callback(t);
    } finally {
      release();
    }
  }

  seed(path: string, data: any) {
    this.records.set(path, structuredClone(data));
  }
  clear() {
    this.records.clear();
    this.virtualDocuments.clear();
    this.resetDocumentCounts();
  }
  getDocument(path: string) {
    const virtual = this.virtualDocuments.get(path);
    if (virtual) return structuredClone(virtual);
    return this.records.get(path);
  }
  setVirtualDocument(path: string, data: any) {
    this.virtualDocuments.set(path, structuredClone(data));
  }
  resetDocumentCounts() {
    this.documentReadCount = 0;
    this.documentWriteCount = 0;
    this.queryResultSizes.length = 0;
  }
}

export const mockAdminAuth = {
  verifyIdToken: async (token: string) => {
    if (token === 'valid-admin-token' || token === 'admin-token') {
      return { uid: 'admin-uid', email: 'admin@test.com', role: 'admin' };
    }
    if (token.startsWith('valid-garage-relogin-token-')) {
      const gId = token.substring('valid-garage-relogin-token-'.length);
      return { uid: `garage-relogin-uid-${gId}`, email: `garage-relogin-${gId}@test.com`, role: 'garage', garageId: gId };
    }
    if (token.startsWith('valid-garage-token-')) {
      const gId = token.substring('valid-garage-token-'.length);
      return { uid: `garage-uid-${gId}`, email: `garage-${gId}@test.com`, role: 'garage', garageId: gId };
    }
    if (token === 'valid-delegate-token-delegate-a') {
      return { uid: 'delegate-uid', email: 'delegate@test.com', role: 'delegate', entityId: 'delegate-a' };
    }
    if (token === 'valid-delegate-token' || token === 'delegate-token') {
      return { uid: 'delegate-uid', email: 'delegate@test.com', role: 'delegate' };
    }
    if (token === 'valid-supervisor-token' || token === 'supervisor-token') {
      return { uid: 'supervisor-uid', email: 'supervisor@test.com', role: 'supervisor' };
    }
    if (token.startsWith('valid-staff-relogin-token-')) {
      const garageId = token.substring('valid-staff-relogin-token-'.length);
      return { uid: `staff-relogin-uid-${garageId}`, email: `staff-relogin-${garageId}@test.com`, role: 'staff', garageId };
    }
    if (token.startsWith('valid-staff-peer-token-')) {
      const garageId = token.substring('valid-staff-peer-token-'.length);
      return { uid: `staff-peer-uid-${garageId}`, email: `staff-peer-${garageId}@test.com`, role: 'staff', garageId };
    }
    if (token.startsWith('valid-staff-token-')) {
      const garageId = token.substring('valid-staff-token-'.length);
      return { uid: `staff-uid-${garageId}`, email: `staff-${garageId}@test.com`, role: 'staff', garageId };
    }
    if (token === 'valid-worker-token' || token === 'worker-token') {
      return { uid: 'worker-uid', email: 'worker@test.com', role: 'worker' };
    }
    if (token === 'valid-viewer-token' || token === 'viewer-token') {
      return { uid: 'viewer-uid', email: 'viewer@test.com', role: 'viewer' };
    }
    throw new Error('INVALID_TOKEN');
  }
};

/**
 * Adapt integration requests with role-claim test tokens to realistic active
 * sessions. The session documents are virtual, read-only test fixtures; they do
 * not appear in the mock's persistent records or affect write assertions.
 * Supplying x-session-id explicitly (including an empty value) always takes
 * precedence, so revoked/missing-session cases remain testable.
 */
export function installDefaultWorkerTestSessionHeaders(api: { fetch: (...args: any[]) => any }, db: MockFirestore) {
  const originalFetch = api.fetch.bind(api);
  api.fetch = (input: any, ...rest: any[]) => {
    if (!(input instanceof Request)) return originalFetch(input, ...rest);
    const token = (input.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    let principal: { uid: string; role: string; entityId: string; garageId?: string; sessions: string; entityCollection: string; sessionId: string } | undefined;
    if (token === 'valid-admin-token') principal = { uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessions: 'admin_sessions', entityCollection: 'admin_settings', sessionId: 'test-active-admin' };
    else if (token === 'valid-delegate-token' || token === 'valid-delegate-token-delegate-a') principal = { uid: 'delegate-uid', role: 'delegate', entityId: token.endsWith('-delegate-a') ? 'delegate-a' : 'delegate-uid', sessions: 'delegate_sessions', entityCollection: 'delegates', sessionId: 'test-active-delegate' };
    else {
      const garageRelogin = token.match(/^valid-garage-relogin-token-(.+)$/);
      const garage = token.match(/^valid-garage-token-(.+)$/);
      const staffRelogin = token.match(/^valid-staff-relogin-token-(.+)$/);
      const staffPeer = token.match(/^valid-staff-peer-token-(.+)$/);
      const staff = token.match(/^valid-staff-token-(.+)$/);
      if (garageRelogin) principal = { uid: `garage-relogin-uid-${garageRelogin[1]}`, role: 'garage', entityId: garageRelogin[1], garageId: garageRelogin[1], sessions: 'garage_sessions', entityCollection: 'garages', sessionId: `test-active-garage-relogin-${garageRelogin[1]}` };
      else if (garage) principal = { uid: `garage-uid-${garage[1]}`, role: 'garage', entityId: garage[1], garageId: garage[1], sessions: 'garage_sessions', entityCollection: 'garages', sessionId: `test-active-garage-${garage[1]}` };
      else if (staffRelogin) principal = { uid: `staff-relogin-uid-${staffRelogin[1]}`, role: 'staff', entityId: `staff-uid-${staffRelogin[1]}`, garageId: staffRelogin[1], sessions: 'staff_sessions', entityCollection: 'staff', sessionId: `test-active-staff-relogin-${staffRelogin[1]}` };
      else if (staffPeer) principal = { uid: `staff-peer-uid-${staffPeer[1]}`, role: 'staff', entityId: `staff-peer-entity-${staffPeer[1]}`, garageId: staffPeer[1], sessions: 'staff_sessions', entityCollection: 'staff', sessionId: `test-active-staff-peer-${staffPeer[1]}` };
      else if (staff) principal = { uid: `staff-uid-${staff[1]}`, role: 'staff', entityId: `staff-uid-${staff[1]}`, garageId: staff[1], sessions: 'staff_sessions', entityCollection: 'staff', sessionId: `test-active-staff-${staff[1]}` };
    }
    if (!principal || input.headers.has('x-session-id')) return originalFetch(input, ...rest);

    const sessionPath = `${principal.sessions}/${principal.uid}`;
    const entityPath = `${principal.entityCollection}/${principal.entityId}`;
    const existingEntity = db.records.get(entityPath) || {};
    db.setVirtualDocument(sessionPath, {
      uid: principal.uid,
      role: principal.role,
      entityId: principal.entityId,
      ...(principal.garageId ? { garageId: principal.garageId } : {}),
      sessionId: principal.sessionId,
      isActive: true,
      lastActive: new Date()
    });
    db.setVirtualDocument(entityPath, {
      ...existingEntity,
      activeSessionIds: [...new Set([...(existingEntity.activeSessionIds || []), principal.sessionId])],
      currentSessionId: existingEntity.currentSessionId || principal.sessionId
    });

    const headers = new Headers(input.headers);
    headers.set('x-session-id', principal.sessionId);
    return originalFetch(new Request(input, { headers }), ...rest);
  };
}
