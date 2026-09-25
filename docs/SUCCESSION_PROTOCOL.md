# RQ Agent Succession Protocol

## Purpose

This document is the canonical handoff procedure for continuing the RQ V3 functional-backend program across agents and accounts. The exact owner phrase `tokens ending` is a durable trigger and must be handled before any additional feature work.

## Normal continuation

At the start of every resumed task, read `V3_BACKEND_PLAN.md`, this file, and `AGENTS.md`. Verify the repository path, current branch, `HEAD`, `origin/main`, working-tree state, recent commits, and the latest available validation result. Choose exactly one bounded task from the V3 plan.

## Immediate succession: `tokens ending`

When the owner sends the exact phrase `tokens ending`:

1. Stop feature work immediately. Do not begin another implementation, deployment, migration, browser workflow, or external operation.
2. Inspect and record the branch, `HEAD`, `origin/main`, clean/dirty status, recent commits, changed files, focused validation, full validation, deployment evidence, connector availability, and known blockers.
3. Check only whether protected capabilities are configured. Never print, copy, search for, or place tokens, passwords, Firebase credentials, private keys, or raw environment values in chat, source, logs, or handoff files.
4. Record the last completed slice and its exact next bounded task.
5. Update this protocol or the V3 plan with the current continuation packet when needed.
6. Write a copy-paste startup block naming `/home/ubuntu/RQ-`, the canonical files, verification commands, current SHA, validation evidence, exact next task, and safety boundaries.
7. Run `git diff --check`, inspect the diff for secret-like material, and verify canonical files exist and are non-empty.
8. Publish only the handoff documentation. Do not mix a new feature implementation into the succession commit.
9. Verify the final tree is clean and synchronized with `origin/main` when publication is available.
10. Tell the successor to repeat this same protocol whenever `tokens ending` appears.

Every successor in every future account repeats these steps. The protocol does not claim that an agent can continue without a new task, available execution capacity, or required protected credentials.

## Railway connector continuity

Railway is within project scope. The environment connector **RQ Backend Operator** is already registered and enabled. Before Railway diagnostics or deployment control, inspect the current connector configuration and use the existing connector rather than creating a duplicate. The current connector UID is `4735a906-68d1-44ba-85c7-b60dc6adfb6d`; do not rely on older UID references.

The connector exposes only the read-only tools `backend_health` and `read_backend_endpoint`, initially allowlisted to `/api/health` and `/api/system-config`. Verify the connector with a read-only health call before any operational work; the expected result is HTTP 200 with the deployed commit version. The protected Railway variable is `BACKEND_OPERATOR_TOKEN`; never disclose, print, copy, search for, or place its value in chat, source, logs, command arguments, or handoff files. If the connector is missing or disabled in a future environment, record that as a blocker and use the protected connector review flow: generate a new token locally with a cryptographically secure generator, give the owner only the variable name and protected handoff step (`BACKEND_OPERATOR_TOKEN` in the Railway service Variables panel), register the connector through `manus-config`, and verify `backend_health` without printing the value. Never create a plaintext secret workaround and never weaken backend authentication.

## V3 safety boundaries

The production `server/` backend remains authoritative until a bounded V3 slice has passed its tests and an explicit cutover is approved. Financial operations remain single-authority until reconciliation and rollback evidence exists. Do not expose secrets, perform irreversible production deletion, or deploy an unvalidated change.

## Copy-paste startup

> Repository: `/home/ubuntu/RQ`. Read `RQ_CHECKPOINTED_PRODUCTION_RECOVERY_PLAN.md`, `V3_BACKEND_PLAN.md`, `docs/SUCCESSION_PROTOCOL.md`, and `AGENTS.md`. Verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest validation result. Current published SHA: `fb6e4d9efab81486f9fe9eea84a25ce5ba205791`. Inspect the existing **RQ Backend Operator** connector (UID `4735a906-68d1-44ba-85c7-b60dc6adfb6d`), verify its read-only `backend_health` tool, and never request or expose `BACKEND_OPERATOR_TOKEN`. The exact next bounded task is C1 staging boundary: obtain or create separate Firebase and Railway staging resources; stop and report the blocker if owner access is unavailable. Do not contact production data, change billing, alter the named database, or deploy. If a connector must be rebuilt, generate and hand off the secret only through the protected Railway Variables workflow; never print its value. If the owner sends `tokens ending`, stop feature work and repeat this succession protocol before doing anything else.
