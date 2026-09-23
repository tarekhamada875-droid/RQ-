# RQ Agent Succession Protocol

## Purpose

This document is the **start-to-finish operating procedure** for handing the RQ repository from one agent to the next. It exists so a new agent can begin safely without reconstructing the project from scattered history.

The protocol has two modes:

1. **Normal continuation:** inspect the current state, choose the next bounded task, implement it, validate it, publish it, and update the handoff.
2. **Immediate succession:** when the owner sends the exact phrase `tokens ending`, stop feature work immediately and prepare the handoff before doing anything else.

> A succession handoff is complete only when the next agent can identify the current commit, validation evidence, blockers, exact next task, safety boundaries, and required first commands from this document alone.

## Canonical sources of truth

Read these files in this order:

1. [`NEXT_AGENT_HANDOFF.md`](../NEXT_AGENT_HANDOFF.md) — direct operating instructions and the latest succession packet.
2. [`BACKEND_OVERHAUL_HANDOFF.md`](../BACKEND_OVERHAUL_HANDOFF.md) — implementation evidence and known gaps.
3. [`BACKEND_COMPLETE_OVERHAUL_STAGES.md`](../BACKEND_COMPLETE_OVERHAUL_STAGES.md) — staged plan and exit criteria.
4. [`RAILWAY_DEPLOYMENT_HANDOFF.md`](../RAILWAY_DEPLOYMENT_HANDOFF.md) — deployment contract and production boundaries.
5. The relevant source files and tests named by the latest handoff.

Historical notes are evidence, not authority, when they disagree with the latest verified repository state.

## First five minutes

Before editing any file, run the following commands from `/home/ubuntu/RQ-`:

```bash
git status --short --branch
git log -5 --oneline
git rev-parse HEAD
git rev-parse origin/main
gh run list --repo tarekhamada875-droid/RQ- \
  --workflow production-gate.yml --limit 3 \
  --json databaseId,headSha,status,conclusion,displayTitle,url
```

Then read the latest sections of the canonical handoff files:

```bash
sed -n '1,220p' NEXT_AGENT_HANDOFF.md
tail -120 NEXT_AGENT_HANDOFF.md
tail -120 BACKEND_OVERHAUL_HANDOFF.md
sed -n '1025,1065p' BACKEND_COMPLETE_OVERHAUL_STAGES.md
```

The initial state report must answer five questions:

- What is the exact `HEAD` SHA?
- Is the working tree clean and synchronized with `origin/main`?
- What is the latest successful Production Gate run?
- What is the single next bounded task?
- Which actions are explicitly prohibited?

If any answer is unknown, do not start implementation. Investigate the missing state first.

## Immediate succession procedure

When the owner sends `tokens ending`, follow this order exactly:

1. **Stop feature work.** Do not begin a new implementation slice, deployment, migration, browser workflow, or external operation.
2. **Inspect state.** Record branch, clean/dirty status, `HEAD`, `origin/main`, recent commits, changed files, latest Production Gate, deployment state, known blockers, and connector/MCP availability.
3. **Check secrets safely.** Confirm only whether protected capabilities are configured. Never print, copy, search for, or place tokens, passwords, Firebase credentials, private keys, or raw environment values in chat, source, logs, or handoff files.
4. **Record the last completed slice.** Include implementation SHA, documentation SHA if different, focused test command and result, full validation command and result, and Production Gate run ID and result.
5. **Record blockers.** Distinguish between a missing credential, unavailable connector, missing legitimate preview, browser compatibility issue, deployment propagation issue, and a deliberate safety prohibition.
6. **Name exactly one next task.** It must be bounded, browser-free unless browser access is genuinely required, and safe to start without additional approval.
7. **Write a copy-paste startup block.** The next agent must be able to begin with repository path, canonical file, verification commands, current SHA, latest gate, next task, and safety rules.
8. **Validate the handoff.** Run `git diff --check`, scan the diff for secret-like material, verify all canonical files exist and contain the new packet, and run the repository validation appropriate to the change. For documentation-only changes, at minimum run the complete existing gate if time permits; otherwise run `git diff --check` and record why the full gate was not repeated.
9. **Publish only the handoff.** Commit and push the documentation update. Do not mix a feature implementation into the succession commit.
10. **Verify closure.** Confirm the final tree is clean, `HEAD == origin/main`, the pushed Production Gate result is known, and the final message links the canonical handoff files.

## Decision tree for choosing the next task

Use this order:

1. If a legitimate, current, non-production Cloudflare preview exists **and** an authenticated Firebase browser session is available, perform authenticated preview validation. Do not create a branch merely to manufacture a preview.
2. Otherwise, continue a bounded browser-free task from the active workstream. Prefer non-financial contracts, route boundaries, repository idempotency, reports, queue leases, comparison policy, telemetry redaction, or projection-worker operational preparation.
3. Do not select a task that changes production authority, financial writes, deletion behavior, production flags, legacy-route availability, or automated mutation without a separately approved phase and its prerequisites.
4. If the next task requires a missing choice that would materially change behavior or authority, stop and ask the owner. Do not guess.

## Safety invariants

These rules apply to every continuation:

- The legacy backend remains authoritative until progressive cutover is explicitly approved and all dependent gates pass.
- Production `VITE_V2_READ_*` flags remain false.
- Production shadow traffic remains disabled.
- Financial writes are not dual-written or migrated.
- The projection repair worker remains undeployed, unscheduled, and disconnected from automatic production mutation.
- Physical deletion and irreversible data deletion remain deferred.
- Legacy routes are not removed.
- The Railway operator token is not a Firebase user token.
- Stale or production Cloudflare deployments are not authenticated preview evidence.
- A browser compatibility failure must be fixed through an evidence-based compatibility change; never weaken a capability gate merely to continue testing.
- Read-only evidence must not be described as authenticated user-flow evidence.

## Validation and publication checklist

Before a normal slice is published, confirm the following:

```text
[ ] Scope is bounded and does not change prohibited authority.
[ ] Focused tests pass.
[ ] v2 typecheck passes.
[ ] Firestore-emulator-backed v2 checks pass when relevant.
[ ] Full application tests pass.
[ ] Lint passes.
[ ] Production build passes.
[ ] Maintainability checks pass.
[ ] git diff --check passes.
[ ] Changed files contain no secrets or raw credentials.
[ ] Handoff documents record the exact SHA and evidence.
[ ] Commit is pushed to main.
[ ] Production Gate is successful for that exact SHA.
[ ] Working tree is clean and synchronized with origin/main.
```

A failed check must be recorded with the exact command, failure class, whether it is related to the change, and the next safe action. Do not silently rerun until a failure disappears.

## Handoff record template

Append a dated section to `NEXT_AGENT_HANDOFF.md`, `BACKEND_OVERHAUL_HANDOFF.md`, and `BACKEND_COMPLETE_OVERHAUL_STAGES.md` containing:

```markdown
### [Slice or succession title] — [UTC timestamp]

- Current branch and SHA: `[branch]`, `[full SHA]`
- Working tree: `[clean/dirty]`; origin synchronization: `[synchronized/not synchronized]`
- Last implementation commit: `[SHA]`
- Documentation commit: `[SHA]` if different
- Focused validation: `[command]` — `[result]`
- Full validation: `[commands or named gate]` — `[result]`
- Production Gate: `[run ID and URL]` — `[result]`
- Deployment evidence: `[exact safe evidence or blocked]`
- Connector/MCP state: `[enabled/disabled/blocked without secrets]`
- Known blockers: `[specific blocker]`
- Safety state: `[flags, authority, worker, deletion boundaries]`
- Exact next task: `[one bounded task]`

**Copy-paste startup:**

> Repository: `/home/ubuntu/RQ-`. Read `NEXT_AGENT_HANDOFF.md` first. Verify `[commands]`. Current tip is `[SHA]`; latest gate is `[run ID]`. Start `[exact next task]`. Preserve `[safety boundaries]`. If `tokens ending` appears, stop feature work and repeat this protocol.
```

## Final response format

The closing message after a completed slice should be concise and contain:

1. What changed.
2. What was tested.
3. Exact implementation and documentation SHAs.
4. Production Gate result.
5. Repository cleanliness and synchronization.
6. Links to the canonical handoff files.
7. The exact next task.
8. Any blocker that requires the owner, without requesting unnecessary browser or credential work.

## References

[1]: ../NEXT_AGENT_HANDOFF.md "RQ next-agent operating handoff"
[2]: ../BACKEND_OVERHAUL_HANDOFF.md "RQ backend overhaul evidence handoff"
[3]: ../BACKEND_COMPLETE_OVERHAUL_STAGES.md "RQ complete backend overhaul stages"
[4]: ../RAILWAY_DEPLOYMENT_HANDOFF.md "RQ Railway deployment handoff"
