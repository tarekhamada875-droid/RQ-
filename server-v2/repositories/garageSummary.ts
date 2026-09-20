import { GarageSummarySchema, type GarageSummary } from '../contracts/summary.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

export interface GarageSummaryRepository {
  /** Reads exactly one date-scoped projection document for one garage. */
  getSummary(garageId: string, dateKey: string): Promise<GarageSummary | null>;
}

export class InMemoryGarageSummaryRepository implements GarageSummaryRepository {
  private readonly summaries: ReadonlyMap<string, GarageSummary>;

  constructor(values: ReadonlyArray<GarageSummary>, private readonly costs = new CostCounter()) {
    this.summaries = new Map(values.map((value) => {
      const parsed = GarageSummarySchema.parse(value);
      return [`${parsed.garageId}:${parsed.dateKey}`, parsed];
    }));
  }

  async getSummary(garageId: string, dateKey: string): Promise<GarageSummary | null> {
    if (!garageId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Invalid summary key');
    this.costs.recordRead();
    return this.summaries.get(`${garageId}:${dateKey}`) ?? null;
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
