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

Railway is within project scope. If Railway diagnostics or deployment control is needed, inspect the current connector configuration first. The expected protected variable name is `BACKEND_OPERATOR_TOKEN`; never disclose its value. If no connector exists, continue browser-free repository work and record the missing endpoint or protected credential as a blocker. Do not create a plaintext secret workaround.

## V3 safety boundaries

The production `server/` backend remains authoritative until a bounded V3 slice has passed its tests and an explicit cutover is approved. Financial operations remain single-authority until reconciliation and rollback evidence exists. Do not expose secrets, perform irreversible production deletion, or deploy an unvalidated change.

## Copy-paste startup

> Repository: `/home/ubuntu/RQ-`. Read `V3_BACKEND_PLAN.md`, `docs/SUCCESSION_PROTOCOL.md`, and `AGENTS.md`. Verify `git status --short --branch`, `git rev-parse HEAD`, `git rev-parse origin/main`, and the latest validation result. Start exactly one bounded V3 task, preserving the production `server/` authority and secret-handling rules. If the owner sends `tokens ending`, stop feature work and repeat this succession protocol before doing anything else.
