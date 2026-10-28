import { performance } from 'node:perf_hooks';
import {
  addFinancialReportEvent,
  addFinancialReportSettlement,
  createFinancialReportAccumulator,
  finishFinancialReport,
  type FinancialReportEvent,
  type SettlementRecord
} from '../server/financialReporting';

const PAGE_SIZE = 250;
const RUNS = 25;
const EVENTS_PER_DAY = 4;
const SETTLEMENT_EVERY_DAYS = 30;
const DELEGATE_COUNT = 12;

type TimedResult = { milliseconds: number; peakHeapGrowthBytes: number };

function buildScenario(years: number) {
  const days = years * 365;
  const start = Date.UTC(2020, 0, 1);
  const events: FinancialReportEvent[] = [];
  const settlements: SettlementRecord[] = [];
  for (let day = 0; day < days; day += 1) {
    const timestamp = new Date(start + day * 86_400_000);
    for (let eventIndex = 0; eventIndex < EVENTS_PER_DAY; eventIndex += 1) {
      const delegateId = `delegate-${eventIndex % DELEGATE_COUNT}`;
      events.push({
        eventType: eventIndex % 3 === 0 ? 'commission_earned' : 'recharge_approved',
        aggregateId: `event-${day}-${eventIndex}`,
        occurredAt: timestamp,
        payload: eventIndex % 3 === 0
          ? { commissionAmount: 2.5, delegateId }
          : { amount: 50 + (day % 23), delegateId }
      });
    }
    if (day % SETTLEMENT_EVERY_DAYS === 0) {
      for (let delegate = 0; delegate < DELEGATE_COUNT; delegate += 1) {
        settlements.push({
          settlementId: `settlement-${day}-${delegate}`,
          delegateId: `delegate-${delegate}`,
          settledAt: timestamp,
          previousCycleTotal: 125
        });
      }
    }
  }
  return { events, settlements };
}

function runPaged(events: FinancialReportEvent[], settlements: SettlementRecord[]): TimedResult {
  const baselineHeap = process.memoryUsage().heapUsed;
  let peakHeapGrowthBytes = 0;
  const accumulator = createFinancialReportAccumulator();
  for (let offset = 0; offset < settlements.length; offset += PAGE_SIZE) {
    const page = settlements.slice(offset, offset + PAGE_SIZE);
    for (const row of page) addFinancialReportSettlement(accumulator, row);
    peakHeapGrowthBytes = Math.max(peakHeapGrowthBytes, process.memoryUsage().heapUsed - baselineHeap);
  }
  for (let offset = 0; offset < events.length; offset += PAGE_SIZE) {
    const page = events.slice(offset, offset + PAGE_SIZE);
    for (const row of page) addFinancialReportEvent(accumulator, row);
    peakHeapGrowthBytes = Math.max(peakHeapGrowthBytes, process.memoryUsage().heapUsed - baselineHeap);
  }
  finishFinancialReport(accumulator);
  return { milliseconds: 0, peakHeapGrowthBytes: Math.max(0, peakHeapGrowthBytes) };
}

const results = [1, 3, 10].map((years) => {
  const { events, settlements } = buildScenario(years);
  const timings: number[] = [];
  let peakHeapGrowthBytes = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now();
    const result = runPaged(events, settlements);
    timings.push(performance.now() - started);
    peakHeapGrowthBytes = Math.max(peakHeapGrowthBytes, result.peakHeapGrowthBytes);
  }
  timings.sort((left, right) => left - right);
  return {
    years,
    eventDocuments: events.length,
    settlementDocuments: settlements.length,
    modeledDocumentReads: events.length + settlements.length,
    eventPages: Math.ceil(events.length / PAGE_SIZE),
    settlementPages: Math.ceil(settlements.length / PAGE_SIZE),
    pageSize: PAGE_SIZE,
    runs: RUNS,
    localAggregationP95Ms: Number(timings[Math.ceil(RUNS * 0.95) - 1].toFixed(3)),
    peakHeapGrowthBytes
  };
});

console.log(JSON.stringify({
  benchmark: 'Synthetic page-bounded financial report aggregation',
  node: process.version,
  note: 'Synthetic local CPU and heap measurements; document reads are modeled as one read per returned record. This does not measure live Firestore billing, network latency, Cloudflare Worker CPU, or production p95.',
  results
}, null, 2));
