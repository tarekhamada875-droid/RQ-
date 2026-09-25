# Firestore Database Decision Gate

**Project:** RQ-  
**Prepared:** 2026-09-25  
**Status:** **Blocked pending an owner decision**

## Purpose

The application currently uses a named Firestore database. The database identifier is part of the application’s data-routing configuration, so changing it in source code without migrating data would point the application at a different database and make existing records appear to be missing.

This document is the opening gate for production-readiness work. No production database identifier should be changed until one of the supported operating paths below is explicitly selected and its evidence is recorded.

## Current configuration

| Setting | Current value |
|---|---|
| Firebase project | `gen-lang-client-0091669619` |
| Firestore database ID | `ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759` |
| Current repository branch | `main` |
| Current repository commit at opening | `e14fe68` |
| Data migration performed | No evidence in this repository |
| Staging project verified | No evidence in this repository |

The same configured database ID is consumed by the browser and Admin SDK paths. Treat it as an environment/data-routing setting, not as a cosmetic configuration value.

## Decision required

Select exactly one path:

### Path A — Default database and Spark-compatible operation

Use this path when remaining on Firebase’s no-cost plan is a hard requirement.

Required before changing production configuration:

1. Create or confirm a separate staging Firebase project using its default Firestore database.
2. Validate authentication, Firestore rules, indexes, document shapes, session behavior, and representative read/write flows in staging.
3. Prepare a controlled export/import or document migration from the named database to the production project’s default database.
4. Compare document counts, key aggregates, session records, financial balances, events, projections, and report totals.
5. Define a coordinated cutover and rollback procedure, including write-freeze or write coordination.
6. Switch the browser and Admin SDK configuration together only after the migration evidence is approved.

### Path B — Named database and Blaze billing

Use this path when avoiding a data migration is more important than remaining on Spark.

Required before production launch:

1. Confirm that billing is enabled for the Firebase/Google Cloud project.
2. Configure budgets and alert thresholds; document that budgets notify but do not automatically cap usage.
3. Record expected read, write, storage, and network usage for the initial workload.
4. Define operational requirements that may also require billing, such as backups, PITR, TTL, or database cloning.
5. Retain the current database identifier and verify it in staging and production health checks.

## Owner decision record

Complete this section before proceeding with a production migration or billing change.

| Field | Value |
|---|---|
| Selected path | `Pending — choose Path A or Path B` |
| Decision owner | `Pending` |
| Decision date | `Pending` |
| Staging Firebase project | `Pending` |
| Staging database ID | `Pending` |
| Migration runbook / billing plan | `Pending` |
| Rollback plan | `Pending` |
| Approval/evidence link | `Pending` |

## Safe continuation point

Until the owner decision is recorded, continue only with changes that do not alter Firebase data routing, billing, authentication/session behavior, financial rules, or deployment topology. The next agent may work on isolated documentation, test coverage, or static-analysis cleanup, but must not replace the configured database ID or run a migration against production.

## Acceptance evidence

The gate is complete only when all of the following exist:

- A recorded selection of Path A or Path B.
- A separate staging environment and documented separation from production data.
- A migration and rollback plan for Path A, or billing controls and usage policy for Path B.
- Verified rules, indexes, authentication, and representative application workflows in staging.
- A reviewed production cutover or billing-activation checklist.
