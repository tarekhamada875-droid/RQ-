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

For each bounded change: add a focused regression test, implement only the selected scope, run relevant checks plus `npm run ci:check` and `npm run maintainability:check`, inspect `git diff --check`, use a focused branch and pull request, wait for required gates, and report the actual status plainly. Stop after the selected task.
