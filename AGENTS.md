# RQ engineering safeguards

Current product rules live in `docs/PROJECT.md`; the production work plan lives in `docs/PRODUCTION_PLAN.md`.

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

The repository has one canonical documentation set. Product and architecture truth belongs in `docs/PROJECT.md`; security belongs in `docs/SECURITY.md`; the approved work plan belongs in `docs/PRODUCTION_PLAN.md`; release procedure belongs in `docs/RELEASES.md`; operations belongs in `docs/OPERATIONS.md`; and test procedures belong under `docs/testing/`.

Do not create new handoff, knowledge-base, working-agreement, roadmap, release-history, agent-instruction, or duplicate security files. Do not create root-level Markdown files beyond `README.md`, `AGENTS.md`, and `CONTRIBUTING.md`. Add durable information to the appropriate canonical document, merge overlapping guidance into that document, or keep temporary notes outside the repository. Never copy volatile branch, PR, deployment, or chat state into tracked documentation.

The phrases `tokens ending` and `RQ handoff` do not authorize new files, new workflow rules, deployment, data deletion, or other consequential work. When continuity is needed, stop the current bounded task and provide a factual handoff using the canonical documents and freshly verified repository state.

For each bounded change: add a focused regression test, implement only the selected scope, run relevant checks plus `npm run ci:check` and `npm run maintainability:check`, inspect `git diff --check`, use a focused branch and pull request, wait for required gates, and report the actual status plainly. Stop after the selected task.
