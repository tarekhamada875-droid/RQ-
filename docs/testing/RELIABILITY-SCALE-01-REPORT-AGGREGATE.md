# Reliability and Scale 01: bounded report reads and maintained aggregates

## Scope

This slice hardens garage reports for the initial ten-garage target using synthetic data only. It does not read, write, delete, backfill, or deploy against production records.

## Delivered behavior

- Daily activity-log report queries are scoped to `actionType == check_out`, Cairo-day boundaries, and a maximum of 200 records.
- New business days initialize `daily_stats/{cairoDate}.report` with `reportAggregateVersion: 1`.
- Authoritative check-out transactions update the daily aggregate atomically with the existing daily-stat write.
- The aggregate stores total departures, hourly/overnight breakdowns, gross revenue, and staff counts/revenue.
- Dashboard summary returns the fixed-size aggregate when present.
- The reports screen uses the aggregate when fresh and falls back to the bounded checkout-only feed for legacy days without the aggregate.
- Idempotency remains enforced before aggregate mutation; duplicate retries do not increment the aggregate.

## Synthetic validation

| Check | Result |
|---|---:|
| Aggregate reducer and report regressions | 6/6 passed |
| Concurrent synthetic check-outs | 100 unique operations counted exactly once |
| Concurrent duplicate retries | 1 applied, 2 ignored |
| 10,000-operation stress simulation | 10 garages, 256 workers, 0 failures |
| Full production gate | Passed |

The 10,000-operation model used 949 report queries. Modeled report reads decreased from 191,698 with the legacy bounded activity page to 2,847 with the fixed-size aggregate: **98.51% reduction**. The aggregate reuses the existing daily-stat document write inside the check-out transaction, so it adds **zero additional Firestore document writes per checkout** in the model.

## Migration and rollback safety

- Existing daily-stat documents without `reportAggregateVersion: 1` are not treated as complete aggregates.
- Those legacy days continue using the bounded checkout-only activity feed.
- No production backfill is included in this slice.
- Rollback can remove aggregate consumption from the reports UI while retaining the existing bounded fallback; no destructive data operation is required.
- Any future backfill requires an exact predicate, verified backup, explicit owner approval, bounded resumable execution, and zero-residue verification.

## Current status: historical evidence only

This report preserves the completed implementation and synthetic validation above. At the time it was written, deployment and a ten-garage load/cost test were listed as possible separate follow-ups. The owner later marked the Reliability and Scale workstream skipped. **Do not run that load/cost test or resume the skipped workstream from this report.** Current implementation work is governed only by `docs/UI_PERFORMANCE_PLAN.md`.
