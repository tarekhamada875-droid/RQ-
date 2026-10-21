# RQ engineering safeguards

Current product rules live in `docs/PROJECT.md`.

- Preserve the current UI/UX, bilingual behavior, Egyptian license-plate identity, RTL/LTR layout, and responsive behavior unless explicitly approved otherwise.
- The Worker/API is authoritative for authentication, authorization, garage scope, money, subscriber eligibility, counters, and financial reports.
- Use atomic Firestore transactions for multi-document business mutations and idempotency for retried user intents.
- Never trust role, garage, amount, credit, or financial fields supplied by the browser without server validation.
- Use one canonical business rule instead of competing client/server or legacy runtime paths.
- Use validated Cairo calendar-date helpers for date-only business values.
- Do not expose subscriber PII from lookup or diagnostic endpoints.
- Use synthetic emulator data for tests. Never commit credentials, tokens, service-account files, or real customer data.
- Do not delete or alter stored data until the exact scope, backup, and verification steps are documented and explicitly confirmed.
- Do not claim a change is merged, deployed, or live until the relevant checks prove it.

## Documentation governance

The repository has one canonical documentation set. Product and architecture truth belongs in `docs/PROJECT.md`; the scoped UI performance program belongs in `docs/UI_PERFORMANCE_PLAN.md`; security belongs in `docs/SECURITY.md`; release procedure belongs in `docs/RELEASES.md`; operations belongs in `docs/OPERATIONS.md`; and test procedures belong under `docs/testing/`.

Do not create new handoff, knowledge-base, working-agreement, roadmap, release-history, agent-instruction, or duplicate security files. Do not create root-level Markdown files beyond `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`. Add durable information to the appropriate canonical document, merge overlapping guidance into that document, or keep temporary notes outside the repository. Never copy volatile branch, PR, deployment, or chat state into tracked documentation.

The owner’s code word `tokens ending` is a permanent continuity trigger. When the owner sends it, immediately stop starting new implementation work and do the following: finish or safely stop only the current bounded operation; do not leave uncommitted or untracked work; verify `git status`, the current branch, `HEAD`, `origin/main`, open pull requests, and required check results; preserve work only through a focused commit and pull request when it is complete enough to review; otherwise discard partial local edits rather than handing them to the next agent. Before writing the handoff, validate every referenced repository path with a fresh readable-file check, validate every external or sandbox-only artifact separately, and label missing or inaccessible artifacts as missing; never present a path from the current sandbox as available to a separate account unless it is committed in the repository or explicitly transferred. Prefer canonical files that exist on `origin/main`, and include exact contents or a concise factual replacement in the copy-paste message when a required artifact cannot be transferred. The final response must contain a concise factual status summary and one complete, self-contained, copy-paste-ready message addressed to the next separate Manus account. That message must include the verified repository commit, only canonical documents confirmed to exist, approved product rules, completed work, current tests and PR state, exact next slice, execution/merge requirements, any missing-artifact warning, and this same `tokens ending` propagation rule. Every successor agent must repeat this protocol when the owner sends `tokens ending`, so handoffs form a continuous chain rather than ending at one agent. A new Manus account is not automatically created or transferred by this code word; the handoff message must be ready to paste into that account. The phrase must never authorize deployment, data deletion, credentials use, or unrelated scope expansion.

For each bounded change: add a focused regression test, implement only the selected scope, run relevant checks plus `npm run ci:check` and `npm run maintainability:check`, inspect `git diff --check`, use a focused branch and pull request, wait for required gates, and report the actual status plainly. Stop after the selected task.
