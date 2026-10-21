import { performance } from 'node:perf_hooks';
import { aggregateProjectionBuckets } from '../server/dashboardSummary';
import { listenerTracker } from '../src/utils/listenerTracker';

const GARAGE_COUNT = 10;
const LISTENERS_PER_GARAGE = 4;
const DAILY_ACTIVITY_LIMIT = 200;
const SUBSCRIBER_PAGE_SIZE = 50;
const PROJECTION_SHARDS = 8;

interface SyntheticVehicle {
  totalCost: number;
  type: 'hourly' | 'overnight';
}

function makeVehicles(count: number): SyntheticVehicle[] {
  return Array.from({ length: count }, (_, index) => ({
    totalCost: 12.5 + (index % 7),
    type: index % 3 === 0 ? 'overnight' : 'hourly'
  }));
}

function makeProjectionBuckets(vehicles: SyntheticVehicle[]) {
  const perShard = Math.max(1, Math.ceil(vehicles.length / PROJECTION_SHARDS));
  return Array.from({ length: PROJECTION_SHARDS }, (_, shard) => {
    const slice = vehicles.slice(shard * perShard, (shard + 1) * perShard);
    const revenue = slice.reduce((sum, vehicle) => sum + vehicle.totalCost, 0);
    return {
      activeVehicleCount: 0,
      entriesToday: slice.length,
      exitsToday: slice.length,
      grossRevenue: revenue,
      refundTotal: 0,
      netRevenue: revenue
    };
  });
}

function measure<T>(fn: () => T, iterations = 1_000) {
  for (let index = 0; index < 100; index += 1) fn();
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) fn();
  const elapsedMs = performance.now() - start;
  return {
    iterations,
    totalMs: Number(elapsedMs.toFixed(3)),
    averageUs: Number(((elapsedMs * 1_000) / iterations).toFixed(3))
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`TEN_GARAGE_READINESS_FAILED: ${message}`);
}

function runListenerChurn() {
  listenerTracker.reset();
  const unsubscribers: Array<() => void> = [];
  for (let garage = 0; garage < GARAGE_COUNT; garage += 1) {
    for (let listener = 0; listener < LISTENERS_PER_GARAGE; listener += 1) {
      unsubscribers.push(listenerTracker.register(`synthetic-garage-${garage}/listener-${listener}`));
    }
  }
  const peakSnapshot = listenerTracker.getTelemetrySnapshot();
  assert(peakSnapshot.activeListeners === GARAGE_COUNT * LISTENERS_PER_GARAGE, 'synthetic listeners did not reach the expected bounded peak');
  assert(peakSnapshot.peakActiveListeners === peakSnapshot.activeListeners, 'peak listener telemetry is inconsistent');
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  const finalSnapshot = listenerTracker.getTelemetrySnapshot();
  assert(finalSnapshot.activeListeners === 0, 'synthetic listener cleanup leaked active listeners');
  assert(finalSnapshot.registrationCount === finalSnapshot.unregistrationCount, 'registration and cleanup counts diverged');
  return { peak: peakSnapshot, final: finalSnapshot };
}

const vehiclesPerGarage = 500;
const vehicles = makeVehicles(vehiclesPerGarage);
const buckets = makeProjectionBuckets(vehicles);
const listenerTelemetry = runListenerChurn();
const summaryTiming = measure(() => aggregateProjectionBuckets(buckets));
const reportTiming = measure(() => vehicles.reduce((total, vehicle) => total + vehicle.totalCost, 0));

const modeledReads = {
  garages: GARAGE_COUNT,
  dashboardSummaryPerGarage: 1 + PROJECTION_SHARDS,
  dashboardSummaryTotal: GARAGE_COUNT * (1 + PROJECTION_SHARDS),
  todayActivityPerGarage: DAILY_ACTIVITY_LIMIT,
  todayActivityTotal: GARAGE_COUNT * DAILY_ACTIVITY_LIMIT,
  subscriberFirstPagePerGarage: SUBSCRIBER_PAGE_SIZE + 1,
  subscriberFirstPageTotal: GARAGE_COUNT * (SUBSCRIBER_PAGE_SIZE + 1)
};

assert(modeledReads.todayActivityPerGarage === DAILY_ACTIVITY_LIMIT, 'daily activity model exceeded its cap');
assert(modeledReads.subscriberFirstPagePerGarage === SUBSCRIBER_PAGE_SIZE + 1, 'subscriber page sentinel model changed');

console.log(JSON.stringify({
  benchmark: 'RQ synthetic ten-garage load-readiness',
  node: process.version,
  syntheticOnly: true,
  productionReads: false,
  workload: {
    garages: GARAGE_COUNT,
    vehiclesPerGarage,
    projectionShardsPerGarage: PROJECTION_SHARDS,
    listenersPerGarage: LISTENERS_PER_GARAGE,
    dailyActivityLimit: DAILY_ACTIVITY_LIMIT,
    subscriberPageSize: SUBSCRIBER_PAGE_SIZE
  },
  modeledReads,
  listenerTelemetry,
  localTimings: {
    dashboardSummaryAggregation: summaryTiming,
    reportAggregation: reportTiming
  },
  note: 'Synthetic local CPU and document-read models only. This does not measure live Firestore billing, network latency, Cloudflare Worker CPU/memory, or production p95.'
}, null, 2));
