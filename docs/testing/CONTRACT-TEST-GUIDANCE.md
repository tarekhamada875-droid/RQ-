# Contract-test guidance

These contracts protect behavior while repeated implementations are consolidated. Current product rules are in `../PROJECT.md`.

## Session claims

A first claim succeeds, a concurrent claim for the same entity fails with the role-specific conflict, refresh by the owning session is idempotent, and release clears ownership only when the caller owns the current session. Cover Admin, garage, delegate, and staff roles.

## Confirmation modals

Confirm invokes exactly one callback, cancel invokes none, loading disables destructive confirmation, backdrop behavior matches risk, and vehicle-specific text contains the correct identifier.

## Prepaid credit grants and commissions

A valid paid credit grant changes the garage balance, ledger, event, activity record, and referral/commission state transactionally. A retry creates no duplicate grant. The first qualifying paid grant for a garage creates exactly one 100 EGP delegate commission; later grants and replayed requests create none. Trial grants use 100 trial credits and are not cash revenue.

## Monthly vehicle subscribers

Subscriber add/update/renew/delete operations remain garage-scoped and Worker-authoritative. Subscriber eligibility uses Cairo calendar dates and both start and end dates. Subscriber renewal consumes credits through one idempotent path and never creates a separate subscriber charge.

## Plate normalization

Storage/search normalization and display formatting remain separate. Cover Arabic and Persian digits, Arabic letter variants, whitespace, overlong input, invalid input, and raw/display round trips.

## Bounded queries

Indexed and fallback queries must return the same normalized ordering and pagination metadata. Required indexes are deployment gates; a missing index must not silently create an unbounded live listener or full-collection scan.
