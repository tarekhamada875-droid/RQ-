# RQ security rules

Every private collection and API route requires authentication. Every garage-scoped operation derives scope from the server-owned session and rejects cross-garage identifiers. Role fields and garage IDs supplied in request bodies are never authority.

The Worker verifies Firebase identity, validates the active role session, applies role permissions, validates input, and performs sensitive writes with Admin SDK transactions. Firestore rules must also deny direct browser mutations for server-owned financial and subscriber operations.

Credit balances, ledger entries, subscriber renewals, vehicle billing, commissions, settlements, events, and projections are not client-authoritative. Financial requests require idempotency and request-fingerprint protection.

Subscriber lookup and management must not expose owner names, phone numbers, notes, or dates outside authorized garage scope. Public endpoints must return minimum necessary data and have abuse controls.

## Required abuse tests

Test anonymous access, invalid/expired sessions, cross-garage reads and writes, role spoofing, body garage spoofing, duplicate/replayed requests, reused idempotency keys with changed payloads, malformed money/date/type/ID values, direct Firestore mutations, oversized payloads, and rate limits.

## Data safety

Use synthetic emulator fixtures locally. Never commit secrets or real customer data. Destructive production data work requires exact collection and predicate scope, a backup/export, resumable bounded execution, authorization, and post-operation verification.

A release is not security-complete because Firestore rules pass. Worker route authentication, scope, validation, response minimization, rate limiting, idempotency, and production configuration must also be tested.
