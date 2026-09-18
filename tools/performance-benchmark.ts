import { performance } from 'node:perf_hooks';
import { aggregateProjectionBuckets } from '../server/dashboardSummary';

interface VehicleRecord { status: string; totalCost: number; type: 'hourly' | 'overnight'; staffName: string; }

function legacyReportAggregation(vehicles: VehicleRecord[]) {
  let revenue = 0;
  let hourly = 0;
  let overnight = 0;
  for (const vehicle of vehicles) {
    revenue += vehicle.totalCost;
    if (vehicle.type === 'hourly') hourly++;
    else overnight++;
  }
  return { exits: vehicles.length, revenue: Number(revenue.toFixed(2)), hourly, overnight };
}

function bucketReportAggregation(buckets: Array<Record<string, number>>) {
  return aggregateProjectionBuckets(buckets);
}

function makeVehicles(count: number): VehicleRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    status: 'outside',
    totalCost: 12.5 + (index % 7),
    type: index % 3 === 0 ? 'overnight' : 'hourly',
    staffName: `staff-${index % 8}`
  }));
}

function makeBuckets(shardCount: number, vehicles: VehicleRecord[]) {
  const perShard = Math.max(1, Math.ceil(vehicles.length / shardCount));
  return Array.from({ length: shardCount }, (_, shard) => {
    const slice = vehicles.slice(shard * perShard, (shard + 1) * perShard);
    return {
      activeVehicleCount: 0,
      entriesToday: slice.length,
      exitsToday: slice.length,
      grossRevenue: slice.reduce((sum, vehicle) => sum + vehicle.totalCost, 0),
      refundTotal: 0,
      netRevenue: slice.reduce((sum, vehicle) => sum + vehicle.totalCost, 0)
    };
  });
}

function measure(label: string, fn: () => unknown, iterations: number) {
  for (let i = 0; i < 2_000; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsedMs = performance.now() - start;
  return { label, iterations, totalMs: elapsedMs, averageUs: (elapsedMs * 1_000) / iterations };
}

const iterations = 20_000;
const scenarios = [
  { name: '300 cars/day', vehicles: makeVehicles(300), shards: 2 },
  { name: '500 cars/day', vehicles: makeVehicles(500), shards: 8 },
  { name: '1000 cars/day', vehicles: makeVehicles(1_000), shards: 8 }
];

const results = scenarios.flatMap(({ name, vehicles, shards }) => {
  const buckets = makeBuckets(shards, vehicles);
  const legacy = measure(`${name} legacy vehicle scan`, () => legacyReportAggregation(vehicles), iterations);
  const optimized = measure(`${name} bucket aggregation (${shards} docs)`, () => bucketReportAggregation(buckets), iterations);
  return [{ scenario: name, readsBefore: vehicles.length + 1, readsAfter: shards + 2, ...legacy }, { scenario: name, readsBefore: vehicles.length + 1, readsAfter: shards + 2, ...optimized }];
});

console.log(JSON.stringify({
  benchmark: 'RQ report aggregation CPU and read-path model',
  node: process.version,
  iterations,
  note: 'readsBefore/readsAfter are Firestore document-read models, not billed production telemetry',
  results
}, null, 2));
