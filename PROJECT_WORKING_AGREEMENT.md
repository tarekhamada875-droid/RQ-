# Working With RQ’s Owner

This guide preserves the owner’s working preferences for future coding agents and human contributors. It carries forward project context and collaboration habits; it does not promise that a future account or agent will retain this conversation’s private chat history.

## The owner’s role and goal

Tarek is the product visionary and decision-maker, not a technical specialist. Help turn the vision for RQ into a reliable product and a sustainable business. Do not make the owner translate a product idea into engineering tasks or choose between technical implementation details when a safe, sensible choice can be made by the project team.

Speak plainly, respectfully, and directly. The owner prefers English in this project unless he writes in another language. Explain necessary technical words in everyday language. Be honest about uncertainty, what has and has not been tested, and whether a change is local, awaiting review, merged, or live.

## How to work

- Read `AGENTS.md`, `RQ_PROJECT_KNOWLEDGE_BASE.md`, this guide, `BRANCHING_AND_RELEASES.md`, and the relevant section of `RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md` before taking on a substantial change. Check GitHub and the working tree to establish current reality; dated reports can become stale.
- Treat the owner’s approved modernization roadmap and broad authorization for its engineering work as permission to make ordinary implementation decisions and carry focused changes through tests, a pull request, and the established release process. Do not pause to ask about routine code organization, names, or test choices.
- Ask only when a missing answer would materially change product behavior or business policy, when the request is genuinely ambiguous, or before an important irreversible external action—especially destructive data operations, financial actions, or account/security changes outside the explicitly authorized scope. For ordinary uncertainty, choose the safest reversible default and record the assumption.
- Understand the real code path before editing: find its users, server route, data access, tests, and related business rule. Prefer a small, reversible change with focused regression tests over a sweeping rewrite. Keep existing user flows and data contracts unless the request requires a change.
- Protect credentials and user data. Use synthetic data for tests. The owner last confirmed on 2026-10-14 that the project is still in synthetic pre-production; verify current status before assuming this remains true. Never treat test data as permission to delete or alter production records.
- Measure before claiming a performance or cost improvement. Say “we expect fewer reads” when that is the evidence; claim a percentage or “10× faster” only when a relevant benchmark proves it.
- Follow the repository’s actual scripts and the latest `BRANCHING_AND_RELEASES.md`; do not invent commands, deployment paths, or staging environments. Run the relevant full checks, review the diff, and use a focused branch/PR. Do not bypass release gates.

## How to report each finished improvement

For **each** completed modernization item, explain the result in a short, owner-friendly update:

1. **What was wrong or awkward** — no jargon.
2. **What changed** — describe the app’s new behavior.
3. **A familiar example** — show what the owner, staff, or customer can now do, using a real-life comparison where helpful.
4. **Why it matters** — security, fewer Firebase reads/writes, fewer mistakes, easier future changes, or a better customer experience. Separate measured results from expected benefits.
5. **Proof and status** — name the important tests/checks and say clearly whether the item is tested locally, in a PR, merged, or live.

Use the owner’s kind of explanation, for example:

> “Before, the app would accept an old digital key if the key still claimed it belonged to you. Now it also checks that the key is still active. It is like a garage door checking that your phone’s key has not been cancelled before it opens. This makes revoked sign-ins safer; tests passed and the change is live.”

Avoid giant lists of raw file names and code details in the main update. Keep those available in the PR or project notes for anyone who wants the engineering detail. Never say the whole modernization plan is complete when only one item is finished.

## Current project map and authority

- `RQ_PROJECT_KNOWLEDGE_BASE.md` is the consolidated project orientation and architecture reference.
- `RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md` is the active, evidence-based improvement roadmap; keep completed, deferred, and still-open tasks distinguishable.
- `AGENTS.md` contains the repository’s mandatory engineering/release safeguards.
- `MAINTAINABILITY_HANDOFF.md` records verified technical details and completed maintenance milestones.
- `BRANCHING_AND_RELEASES.md` governs branches, pull requests, and production release.

The production architecture is Cloudflare Pages (the website) → Cloudflare Worker running Hono (the API) → Firebase Authentication and Firestore (sign-in and data). Read the live repository configuration and current deployment status before relying on a dated note.

## Continuity across contributors or accounts

No new agent should pretend to be the same person or to remember a private conversation it cannot access. Instead, preserve relevant decisions, verified facts, open questions, and milestone status in these tracked project documents and focused PRs. A future contributor should be able to read them and continue the work in the owner’s preferred style.