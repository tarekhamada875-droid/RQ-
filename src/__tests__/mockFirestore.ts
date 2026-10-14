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
      this.db.records.set(this.path, { ...existing, ...data });
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
    this.db.records.set(this.path, { ...existing, ...data });
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
    protected readonly orderings: Array<{ field: string; direction: 'asc' | 'desc' }> = []
  ) {}

  where(field: string, op: string, value: any) {
    return new MockQuery(
      this.db,
      this.collectionPath,
      [...this.wheres, { field, op, value }],
      this.limitVal,
      this.isCollectionGroup,
      this.orderings
    );
  }

  limit(limitVal: number) {
    return new MockQuery(this.db, this.collectionPath, this.wheres, limitVal, this.isCollectionGroup, this.orderings);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new MockQuery(this.db, this.collectionPath, this.wheres, this.limitVal, this.isCollectionGroup, [...this.orderings, { field, direction }]);
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

    for (const ordering of this.orderings) {
      docs.sort((left, right) => {
        const leftValue = left.data()?.[ordering.field];
        const rightValue = right.data()?.[ordering.field];
        if (leftValue === rightValue) return 0;
        const comparison = leftValue < rightValue ? -1 : 1;
        return ordering.direction === 'desc' ? -comparison : comparison;
      });
    }

    if (this.limitVal !== undefined) {
      docs = docs.slice(0, this.limitVal);
    }

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
            this.records.set(ref.path, { ...existing, ...data });
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
          this.records.set(ref.path, { ...existing, ...data });
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
  }
}

export const mockAdminAuth = {
  verifyIdToken: async (token: string) => {
    if (token === 'valid-admin-token' || token === 'admin-token') {
      return { uid: 'admin-uid', email: 'admin@test.com', role: 'admin' };
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
      const garage = token.match(/^valid-garage-token-(.+)$/);
      const staff = token.match(/^valid-staff-token-(.+)$/);
      if (garage) principal = { uid: `garage-uid-${garage[1]}`, role: 'garage', entityId: garage[1], garageId: garage[1], sessions: 'garage_sessions', entityCollection: 'garages', sessionId: `test-active-garage-${garage[1]}` };
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
