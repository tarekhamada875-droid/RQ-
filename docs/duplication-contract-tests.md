# Duplication Refactor Contract Tests

This document defines the behavior that must remain stable before consolidating the remaining repeated implementations.

## Session claim and release

The canonical session contract is atomic ownership. A first claim succeeds, a concurrent claim for the same entity fails with the role-specific conflict, and a refresh by the owning session is idempotent. Release clears the entity lock only when the caller owns the current session; an old tab must not clear a newer session. Tests should cover garage, delegate, staff, and admin role mappings, stale-session takeover after the timeout, concurrent claims, owner-only release, and server-authority fallback behavior. The existing delegate session transaction suite provides the baseline concurrency model and should be extended to the other roles before extracting shared transaction code.

## Confirmation modals

The modal components share visual structure but not business meaning. Every modal contract must verify that confirm invokes exactly one callback, cancel invokes no confirm callback, loading disables destructive confirmation where applicable, backdrop behavior matches the component's risk level, and vehicle-specific text contains the correct identifier. These are component-contract tests, not domain calculation tests, and should be kept separate from service/domain tests.

## Subscription and balance top-up requests

Subscription requests require a garage identity, package identity or name, and a non-negative revenue amount. Balance top-ups use the `amount` field and may use the `balance_topup` package marker; they must not inherit subscription duration, capacity, commission, or discount semantics. Tests must verify valid requests for both variants, missing package identity, missing garage identity, negative amounts, and precedence when both amount fields are present. Server approval tests must additionally verify that package price and duration come from authoritative package documents rather than the client payload.

## Arabic plate normalization

Storage/search normalization and display formatting are distinct contracts. `getRawPlate` must normalize Arabic and Persian digits to Western digits, normalize letters, and cap the plate at four letters and four digits. `getPlateParts` must return the same canonical letter and number segments. `formatPlateNumber` must produce a human-readable display string without becoming the storage key. Tests must cover mixed numeral systems, Arabic letter variants, whitespace, overlong input, invalid input, and round-trip distinctions between raw and display forms.

## Firestore fallback queries

Indexed and fallback queries may share result mapping but must not be merged into one query path that removes the fallback. Contract tests should mock an indexed-query failure, verify the fallback is attempted, and assert that both paths return the same normalized result ordering and pagination metadata.

A refactor is safe only when these contracts pass for both the old and proposed canonical implementation, followed by the full application suite and production build.
