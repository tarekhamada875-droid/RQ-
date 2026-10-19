# Working With RQ’s Owner

This guide preserves the owner’s working preferences for future coding agents and human contributors. It carries forward project context and collaboration habits; it does not promise that a future account or agent will retain this conversation’s private chat history.

## The owner’s role and goal

Tarek is the product visionary and decision-maker, not a technical specialist. Help turn the vision for RQ into a reliable product and a sustainable business. Do not make the owner translate a product idea into engineering tasks or choose between technical implementation details when a safe, sensible choice can be made by the project team.

Speak plainly, respectfully, and directly. The owner prefers English in this project unless he writes in another language. Explain necessary technical words in everyday language. Be honest about uncertainty, what has and has not been tested, and whether a change is local, awaiting review, merged, or live.

## How to work

- Read `AGENTS.md`, `PROJECT_ENGINEERING_KNOWLEDGE.md`, this guide, and `BRANCHING_AND_RELEASES.md` before taking on a substantial change. Check GitHub and the working tree to establish current reality; copied status can become stale.
- Treat the owner’s explicitly selected task from the active Legacy Removal Plan and its stated scope as permission to make ordinary implementation decisions and carry focused changes through tests, a pull request, and the established release process. Do not pause to ask about routine code organization, names, or test choices.
- Ask only when a missing answer would materially change product behavior or business policy, when the request is genuinely ambiguous, or before an important irreversible external action—especially destructive data operations, financial actions, or account/security changes outside the explicitly authorized scope. For ordinary uncertainty, choose the safest reversible default and record the assumption.
- Understand the real code path before editing: find its users, server route, data access, tests, and related business rule. Prefer a small, reversible change with focused regression tests over a sweeping rewrite. Keep existing user flows and data contracts unless the request requires a change.
- Protect credentials and user data. Use synthetic data for tests. The owner last confirmed on 2026-10-14 that the project is still in synthetic pre-production; verify current status before assuming this remains true. Never treat test data as permission to delete or alter production records.
- Measure before claiming a performance or cost improvement. Say “we expect fewer reads” when that is the evidence; claim a percentage or “10× faster” only when a relevant benchmark proves it.
- Follow the repository’s actual scripts and the latest `BRANCHING_AND_RELEASES.md`; do not invent commands, deployment paths, or staging environments. Run the relevant full checks, review the diff, and use a focused branch/PR. Do not bypass release gates.
- For code changes, run focused tests first, then the full local CI gate once after the implementation is stable. Do not repeat the full app suite for a documentation-only change; use the repository’s documentation checks.
- Finish the code change and its project-status notes before opening the PR, so the final reviewed commit is tested once. The full GitHub gate runs on PRs and `main`, not on every feature-branch push.
- A newer commit may cancel an older run for the same PR; never cancel a `main` release. Prefer concise command output, read only relevant file sections, and use one completion wait instead of repeated status polling.

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

- `PROJECT_ENGINEERING_KNOWLEDGE.md` is the single current project orientation and architecture reference.
- Completed task plans are not retained as project guidance. Use the current engineering guide and the selected issue/PR scope as authority.
- `AGENTS.md` contains the repository’s mandatory engineering/release safeguards.
- Release verification belongs in the PR and Production Gate records; durable engineering lessons belong in `PROJECT_ENGINEERING_KNOWLEDGE.md`.
- `BRANCHING_AND_RELEASES.md` governs branches, pull requests, and production release.

The production architecture is Cloudflare Pages (the website) → Cloudflare Worker running Hono (the API) → Firebase Authentication and Firestore (sign-in and data). Read the live repository configuration and current deployment status before relying on a dated note.

## Continuity across contributors or accounts

No new agent should pretend to be the same person or to remember a private conversation it cannot access. Instead, preserve relevant decisions, verified facts, open questions, and milestone status in these tracked project documents and focused PRs. A future contributor should be able to read them and continue the work in the owner’s preferred style.

### The “RQ handoff” trigger

When Tarek says **“RQ handoff”**, or when an agent expects its available context/session to end soon, prepare a concise, current handoff for the next RQ contributor. Treat the phrase as a request to summarize and preserve continuity—not permission to deploy, merge, change Firebase, or revive a retired workstream.

Before handing off, check the actual repository and GitHub state. Record or report:

- the task and its current status;
- branch, commit, working-tree state, and any open PR;
- files or behavior changed, plus checks actually run and their results;
- unresolved decisions, blockers, and external actions not completed;
- the single next recommended step, with the roadmap section to read.

Update the tracked roadmap, knowledge base, or maintainer handoff when verified project facts or decisions have changed; do not add speculative status or duplicate unchanged notes. Never include credentials, secrets, or private customer data in the handoff. If context is ending during unfinished work, state exactly what is incomplete and do not imply that it has been committed, merged, or deployed.

The project-wide code word **“tokens ending — activate the RQ continuity handoff now.”** (with **“tokens ending”** retained as the shorter equivalent) is an active owner continuity trigger for every agent working in this repository. When Tarek says it, the current agent must immediately prepare the factual handoff and apply the standing completion workflow: finish or clearly mark the current bounded task, run the relevant checks, update the roadmap/knowledge-base/maintainer-handoff records, commit and push all work, open a PR to `main`, wait for the required Production Gate, merge when approved by passing checks, verify the merged commit and post-merge workflows, and stop with a concise handoff for the next agent. The final response must also include a complete, ready-to-copy message that Tarek can send to the next agent; it must identify the files to read, verified repository state, single next task, pre-edit checks, and required test-to-merge workflow. If the task is incomplete, state exactly what remains and do not imply that it was committed, merged, deployed, or live. This trigger does not authorize destructive data operations, unapproved Firebase changes, payments, or other consequential actions.

### Required copy-ready message for every successor handoff

Whenever Tarek will hand work to another agent, the final response must include a thorough, self-contained onboarding message—not just a brief next-step summary. Assume the successor cannot see the prior chat. In plain language, explain what RQ is, Tarek’s key priorities, what is finished and what is not, the exact verified repository/GitHub/release state, unresolved decisions and safety limits, and the single next task with scope and boundaries. List the files to read and explicitly require reading the complete `PROJECT_ENGINEERING_KNOWLEDGE.md` guide, not only the next task; Include pre-edit checks and the full branch, test, PR, required-check, merge, and post-merge verification flow. Define jargon or use a simple example where it helps. Tell the successor to verify all copied state again and treat the tracked project documents as authoritative. Follow the detailed checklist in `AGENTS.md`.

Every successor must verify the exact clean `main` SHA, matching `origin/main`, successful main gate, open-PR count, live health/version, and protected decision-branch SHA after the last merge. Never declare the project synchronized from copied text alone. If a mismatch is found, say what was stale and fix it through the normal documentation PR and Production Gate cycle before handing off.

## Owner’s standing task-completion instruction

For every bounded task, Tarek requires the same complete release cycle: implement the selected task; run focused tests and the repository’s full verification gates; update the roadmap, knowledge base, or maintainer handoff; commit the complete change; push the feature branch; open a pull request into `main`; wait for the required Production Gate checks; merge the pull request when those checks pass; verify the merged commit, remote `main`, working tree, and post-merge workflows; and then stop to report the finished task before beginning another one. Agents must not silently continue to the next roadmap item.

The agent must accurately distinguish **local**, **pushed**, **in a PR**, **merged**, **deployed**, and **live** status. It must not claim deployment until the guarded workflow and relevant smoke checks succeed. This standing instruction covers routine roadmap engineering only; it does not authorize destructive data operations, unapproved Firebase changes, payments, security or ownership changes, or other consequential actions outside the approved roadmap.
