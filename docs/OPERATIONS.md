# RQ operations

## Request evidence

Frontend operations may send operation and correlation identifiers. The Worker operation trace records endpoint, authenticated role, garage scope, result, duration, and timestamps without storing passwords, tokens, PINs, request bodies, full plate data, payment details, or IP addresses.

The trace is diagnostic evidence, not the business authority. The authoritative effect is represented by the transaction, vehicle/subscriber record, ledger, domain event, activity record, and projection.

## Monitoring

Monitor route latency, Firestore reads/writes, transaction retries, authentication and authorization failures, rate limits, listener counts, summary fallback frequency, report page counts, stale summaries, and missing operation traces. Set Firebase budget alerts and Cloudflare request limits before public launch.

## Backup and recovery

Before destructive data work, export the exact affected collections and verify that the export is readable. Destructive operations must be bounded, resumable, authorized, and followed by a count/residue check. Test restoration before treating backups as production-ready.

## Production checks

Verify Worker health/version, Pages deployment, Firestore ruleset identity, required indexes, and the latest Production Gate. A successful UI response alone does not prove the backend transaction or financial records are correct.

## Trace retention

Operation traces should have a bounded retention policy such as Firestore TTL on `expiresAt`. Confirm the policy in the target Firebase project and monitor storage growth.
