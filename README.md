# RQ

RQ is an Arabic-only garage-management PWA for vehicle entry/exit, garage customer subscribers, prepaid credits, staff, delegates, and Admin operations.

## Architecture

```text
Cloudflare Pages frontend -> Cloudflare Worker API (Hono) -> Firebase Authentication + Firestore
```

The Worker owns authentication, authorization, garage scope, financial decisions, transactions, idempotency, and audit records. The browser must not approve payments, mutate balances, or decide authority from stale state.

The active financial model is prepaid credits. Regular vehicle entry consumes 1 credit at check-in; monthly subscriber renewal debits 5 paid credits. Admin credit grants are 50–2,000 EGP per operation. Current rules are in [`docs/PROJECT.md`](docs/PROJECT.md).

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
- [`docs/LAST-PLAN-BEFORE-PRODUCTION.md`](docs/LAST-PLAN-BEFORE-PRODUCTION.md) — completed production plan and resolved decisions (historical record)
- [`docs/SECURITY.md`](docs/SECURITY.md) — security and authorization invariants
- [`docs/RELEASES.md`](docs/RELEASES.md) — branch, PR, validation, and deployment workflow
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — monitoring, traces, backup, restore, and rollback
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution rules
- [`AGENTS.md`](AGENTS.md) — engineering safeguards
- [`docs/testing/`](docs/testing/) — emulator, browser-fixture, and contract-test guidance (historical evidence)

Do not rely on old handoff notes, dated release narratives, or generated build output as project instructions.
