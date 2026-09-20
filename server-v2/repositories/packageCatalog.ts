import { PackageSchema, type Package } from '../contracts/entities.js';

export type ReadCost = Readonly<{
  reads: number;
  writes: number;
  deletes: number;
  transactionAttempts: number;
}>;

export interface PackageCatalogRepository {
  listActive(limit: number): Promise<ReadonlyArray<Package>>;
}

export class CostCounter {
  private counts: ReadCost = { reads: 0, writes: 0, deletes: 0, transactionAttempts: 0 };

  recordRead(count = 1): void { this.counts = { ...this.counts, reads: this.counts.reads + count }; }
  recordWrite(count = 1): void { this.counts = { ...this.counts, writes: this.counts.writes + count }; }
  recordDelete(count = 1): void { this.counts = { ...this.counts, deletes: this.counts.deletes + count }; }
  recordTransactionAttempt(): void { this.counts = { ...this.counts, transactionAttempts: this.counts.transactionAttempts + 1 }; }
  snapshot(): ReadCost { return this.counts; }
}

export class InMemoryPackageCatalogRepository implements PackageCatalogRepository {
  constructor(private readonly packages: ReadonlyArray<Package>, private readonly costs = new CostCounter()) {
    for (const item of packages) PackageSchema.parse(item);
  }

  async listActive(limit: number): Promise<ReadonlyArray<Package>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Package limit must be between 1 and 100');
    this.costs.recordRead();
    return this.packages.filter((item) => item.active).slice(0, limit);
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
