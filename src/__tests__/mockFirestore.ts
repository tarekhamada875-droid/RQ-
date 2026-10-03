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
    const val = this.db.records.get(this.path);
    return new MockDocumentSnapshot(this.id, val !== undefined, val, this);
  }

  async set(data: any, options?: { merge?: boolean }) {
    if (options?.merge) {
      const existing = this.db.records.get(this.path) || {};
      this.db.records.set(this.path, { ...existing, ...data });
    } else {
      this.db.records.set(this.path, data);
    }
  }

  async update(data: any) {
    const existing = this.db.records.get(this.path);
    if (existing === undefined) {
      throw new Error(`Document not found: ${this.path}`);
    }
    this.db.records.set(this.path, { ...existing, ...data });
  }

  async delete() {
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
    protected readonly isCollectionGroup: boolean = false
  ) {}

  where(field: string, op: string, value: any) {
    return new MockQuery(
      this.db,
      this.collectionPath,
      [...this.wheres, { field, op, value }],
      this.limitVal,
      this.isCollectionGroup
    );
  }

  limit(limitVal: number) {
    return new MockQuery(this.db, this.collectionPath, this.wheres, limitVal, this.isCollectionGroup);
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

    if (this.limitVal !== undefined) {
      docs = docs.slice(0, this.limitVal);
    }

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
    const t = {
      get: async (ref: MockDocumentReference) => {
        return ref.get();
      },
      set: (ref: MockDocumentReference, data: any, options?: { merge?: boolean }) => {
        if (options?.merge) {
          const existing = this.records.get(ref.path) || {};
          this.records.set(ref.path, { ...existing, ...data });
        } else {
          this.records.set(ref.path, data);
        }
      },
      update: (ref: MockDocumentReference, data: any) => {
        const existing = this.records.get(ref.path);
        if (existing === undefined) {
          throw new Error(`Document not found: ${ref.path}`);
        }
        this.records.set(ref.path, { ...existing, ...data });
      },
      delete: (ref: MockDocumentReference) => {
        this.records.delete(ref.path);
      }
    };
    return callback(t);
  }

  seed(path: string, data: any) {
    this.records.set(path, structuredClone(data));
  }

  clear() {
    this.records.clear();
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
    throw new Error('INVALID_TOKEN');
  }
};
