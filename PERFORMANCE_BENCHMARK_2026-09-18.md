# RQ Performance Benchmark — 2026-09-18

## Executive result

The optimized report path has bounded projection aggregation cost, while the legacy report calculation scales linearly with the number of exited vehicles. Under the modeled Firestore document reads, the report aggregate path decreases from **301 to 4 reads** for a 300-car garage, **501 to 10 reads** for a 500-car garage, and **1001 to 10 reads** for a 1000-car garage.

These read figures are a deterministic document-count model, not billed production telemetry. The live HTTP measurement below measures the deployed backend health endpoint, not an authenticated dashboard-summary request.

## Methodology

The benchmark ran on Node.js `v22.13.0` with 20,000 iterations per scenario. The legacy CPU path scans every completed vehicle record and calculates exits, revenue, and vehicle type counts. The optimized CPU path aggregates the bounded sharded bucket records. Scenarios used 300, 500, and 1000 completed vehicles with 2 or 8 projection shards.

The modeled legacy report-open reads are `exited vehicle documents + 1 garage document`. The optimized summary reads are `projection bucket documents + 1 garage document + 1 summary/fallback lookup`, represented as `shards + 2`.

## Results

| Scenario | Legacy modeled reads | Optimized modeled reads | Read reduction | Legacy CPU avg | Optimized CPU avg | CPU speedup |
|---|---:|---:|---:|---:|---:|---:|
| 300 cars/day, 2 shards | 301 | 4 | 98.67% | 2.714 µs | 1.690 µs | 1.61× |
| 500 cars/day, 8 shards | 501 | 10 | 98.00% | 4.022 µs | 1.983 µs | 2.03× |
| 1000 cars/day, 8 shards | 1001 | 10 | 99.00% | 4.231 µs | 1.091 µs | 3.88× |

The optimized CPU timings are not intended as network latency predictions. They isolate the aggregation algorithm and show its bounded behavior.

## Live deployed HTTP timing

Twenty unauthenticated requests were sent to `https://parqv2.vercel.app/api/health`:

| Samples | Minimum | Median | P95 | Mean |
|---:|---:|---:|---:|---:|
| 20 | 274.932 ms | 289.107 ms | 379.248 ms | 304.126 ms |

This health endpoint timing includes network, TLS, Vercel routing, and function startup behavior. It is a baseline for the deployed backend, not a before/after comparison of the dashboard summary endpoint.

## Interpretation

The main savings come from avoiding a full exited-vehicle collection read whenever the reports overlay opens. The optimized path is bounded by the configured shard count, while the legacy path grows with daily transaction volume. Staff-performance details still use the existing completed-transaction subscription when expanded because checkout protection depends on that subscription.

A production before/after latency comparison for the authenticated summary endpoint requires authenticated request telemetry or a controlled test account. The current benchmark deliberately does not fabricate that result. The next measurement should record endpoint response time, Firestore document count, and response source (`live_projection_buckets` versus legacy fallback) in a privacy-safe server metric.
