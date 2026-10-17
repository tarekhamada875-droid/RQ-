# BILL-08 billing cutover support and rollback

**Status: proposed operating procedure only.** The migration calculator is preview-only. No live conversion or rollback tool exists yet, and no garage balances have been changed. This document is not permission to run a cutover. The owner must approve the exception rules and the exact cutover before any live write.

## Before converting a garage

1. Take an immutable, per-garage snapshot in the migration record. Include the old billing model, approval/trial/lock/suspension status, EGP wallet balance, plan expiry, referral balance and referral days, any existing credit balance, and the pending-recharge count. Record the run ID, time, and authorized Admin. Do not put customer contact details in reports or notes.
2. Calculate the preview from that snapshot. Use 10 credits for each remaining 24-hour plan day, rounded up, and convert whole EGP to the same number of credits at 1 EGP = 1 credit. Convert the wallet amount into credits before adding it to any other credit amount. Keep EGP receipts and credit totals as separate report lines.
3. Do not convert a garage if its status is not approved, its billing fields changed after the preview, it is a trial/locked/suspended garage, it has an invalid amount or expiry, it has an unresolved referral balance, or it has a pending recharge request. Hold it for owner/admin review instead of guessing.
4. When the owner authorizes cutover, convert one garage at a time through a server-authoritative transaction. The transaction must re-check the snapshot values, reject a repeated migration run, write separate auditable ledger entries for plan value and wallet value, update the credit balance and billing model together, and record the migration run ID. Do not edit Firestore directly in the Console.

## If conversion fails

1. Stop the remaining conversions. Do not rerun a partially completed garage with a new run ID. Record which garages completed, which did not, the error, and the migration run ID.
2. For a garage with **no credit grants, spending, or subscriber renewal after conversion**, an Admin-only, atomic, idempotent rollback may restore the exact pre-cutover billing values from that garage’s immutable snapshot. It must record a compensating reversal for the conversion entries so the converted credits cannot still be spent. Keep the original migration record and ledger history; never delete or rewrite historical EGP payment records.
3. If any credit activity happened after conversion, **do not restore the old EGP wallet or expiry by simply copying the snapshot**. That could give the garage value twice or undo real usage. Keep the garage on the prepaid model while the issue is reviewed. Use only a separately implemented, auditable correction approved by the owner; if the state cannot be reconciled, pause further billing changes for that garage and ask the owner before proceeding.
4. If the snapshot is missing, the transaction result is uncertain, or the current values do not match the snapshot, do not guess and do not use a whole-database restore for one garage. Keep the garage on hold and reconcile its ledger and migration record first.

## After a rollback or correction

Verify that the garage has only one usable balance, that the migration and reversal records are still present, and that no payment receipt or historical money event was changed. Check that the garage’s billing model matches the intended state and that the Admin report still shows EGP and credits separately. Record the reviewer, reason, and verification result.

Before any cutover, the rollback transaction and its tests must be implemented and exercised with synthetic cases for: no activity after conversion, activity after conversion, duplicate retries, changed source values, and an uncertain transaction result. This playbook does not claim those controls currently exist.
