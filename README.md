# RQ

RQ is a bilingual Arabic/English garage-management PWA for vehicle entry/exit, garage customer subscribers, prepaid credits, staff, delegates, and Admin operations.

## Architecture

```text
Cloudflare Pages frontend -> Cloudflare Worker API (Hono) -> Firebase Authentication + Firestore
```

The Worker owns authentication, authorization, garage scope, financial decisions, transactions, idempotency, and audit records. The browser must not approve payments, mutate balances, or decide authority from stale state.

The active financial model is prepaid credits. Monthly vehicle subscribers remain a separate garage-owned feature and have no separate subscriber charge. Current rules are in [`docs/PROJECT.md`](docs/PROJECT.md).

## Development

Use Node.js 22 and npm:

```bash
npm ci
npm run dev
```

Full local validation (clean install, tests, rules, typecheck, production build, artifact smoke, and maintainability):

```bash
npm run ci:check
git diff --check
```

Use synthetic emulator data locally. Never commit `.env` files, service-account files, private keys, tokens, or real customer data.

## Canonical documents

- [`docs/PROJECT.md`](docs/PROJECT.md) — current product model and architecture
- [`docs/UI_PERFORMANCE_PLAN.md`](docs/UI_PERFORMANCE_PLAN.md) — the single pre-production and pilot readiness plan
- [`docs/SECURITY.md`](docs/SECURITY.md) — security and authorization invariants
- [`docs/RELEASES.md`](docs/RELEASES.md) — branch, PR, validation, and deployment workflow
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — monitoring, traces, backup, restore, and rollback
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution rules
- [`AGENTS.md`](AGENTS.md) — engineering safeguards
- [`docs/testing/`](docs/testing/) — emulator, browser-fixture, and contract-test guidance
- [`docs/testing/CONTRACT-TEST-GUIDANCE.md`](docs/testing/CONTRACT-TEST-GUIDANCE.md) — regression contracts for shared behavior

Do not rely on old handoff notes, dated release narratives, or generated build output as project instructions.
