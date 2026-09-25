# Financial and Payment Workflow Audit

## Executive conclusion

The payment system is not fundamentally broken. The current implementation already has strong server-side foundations for the most sensitive money transitions: important changes run inside Firestore transactions, requests use idempotency records, package purchases derive pricing from server-side package documents, wallet credits have an immutable ledger entry, and financial events are recorded alongside state changes.

This audit found and corrected four concrete issues that could confuse users or create inconsistent financial records. Direct wallet top-ups and self-service subscriptions now send idempotency keys from the client. The admin request screen no longer promises a hard-coded delegate commission that could disagree with the server’s monthly commission policy. Package creation now validates price, duration, capacity, discount, and active-state fields on the server before saving. Financial reporting now separates subscription revenue from wallet credits and exposes total cash collected instead of silently omitting wallet cash receipts.

The previously documented defect in which approving a wallet top-up failed to credit the wallet is already fixed in the current branch. Its approval path now increments the garage balance, records the before-and-after balance in the manual credit ledger, emits a wallet-top-up event, and does not activate a subscription or award a delegate commission.

## What was reviewed

The review covered admin financial reports, garage wallet balances, direct admin recharge, garage self-subscription, delegate subscription requests, balance-top-up requests, package pricing and discounts, commission display, recharge approval and rejection, financial event recording, idempotency, role and garage scope checks, and Firestore rules for financial collections.

The review followed the payment path through the frontend service layer, server routes, transaction logic, event ledger, report calculation, and user-facing admin screens. No WebDev or GameDev tooling was used.

## Confirmed issues corrected

| Area | Problem | Correction |
|---|---|---|
| Wallet top-up replay safety | The server required an idempotency key, but the direct admin wallet-top-up client method did not send one. | The client now generates a key for every direct wallet top-up. |
| Self-subscription replay safety | The server required an idempotency key, but the garage self-subscription client method did not send one. | The client now generates a key for every self-service subscription. |
| Delegate commission display | The pending-request UI displayed a fixed amount that did not match the server’s configurable threshold and monthly policy. | The UI now shows a recorded commission when present; otherwise it says the commission is calculated at approval. |
| Package configuration integrity | Admin package creation accepted arbitrary request fields without running the same validation used during purchase. | The server now validates the package catalog record and stores only normalized pricing, discount, duration, capacity, and active-state fields. |
| Financial report completeness | Wallet credits were recorded as events but were not visible in the financial report totals. | Reports now provide subscription revenue, wallet credits, and total cash collected as separate figures. |

## Payment flows that are currently sound

### Garage wallet credits

Admin-approved balance-topup requests use a dedicated branch. The branch validates the amount, updates the garage balance transactionally, changes the request status, writes an activity log, emits a `wallet_topup_approved` event, and writes an immutable manual-credit ledger entry. It does not extend subscription expiry, change package capacity, update subscription statistics, or create a delegate commission.

Direct admin wallet top-ups use the same basic safeguards. They validate the amount, update the balance transactionally, write an activity record, emit a wallet event, and persist a ledger record.

### Subscription approval

Subscription requests derive package price, duration, discount, capacity, and unlimited status from the authoritative package document. Client-supplied price and capacity fields are not trusted for the approval calculation. Inactive or missing packages are rejected. The approval path also uses a transaction and idempotency record.

### Garage self-service subscription

The self-service route verifies that the caller is the garage owner or an admin, loads the package from the server, rejects missing and inactive packages, applies server-side discounts and the monthly-subscriber fee, verifies the wallet balance, and deducts the exact amount transactionally. It records both the wallet debit and package purchase events.

### Delegate scope

Delegate recharge-request creation verifies that the delegate is associated with the target garage through the configured creator or referrer relationship. Admin-only approval and rejection routes are protected on the server. Financial reports are also restricted to admins.

### Package deactivation

Package deletion is implemented as deactivation rather than physical deletion. This preserves historical package references while preventing new purchases of inactive packages.

## Remaining risks and decisions

The following items were not changed because they require either a broader security remediation or a product decision rather than a safe local correction.

First, the existing repository audit identifies stale-session authorization as a high-priority security concern. Every protected server request should verify the active session record and the entity’s current session binding, not only the Firebase UID. This affects all roles and should be handled as a dedicated authentication change with integration tests.

Second, the repository audit identifies lock and suspension enforcement as incomplete in some vehicle mutation routes. A locked garage should not be able to bypass the dashboard through a direct API call. The product owner should also decide whether a lock blocks checkout and correction of vehicles already inside. That policy should then be enforced consistently on the server.

Third, the report currently treats wallet credits as cash collected and keeps subscription purchases separate. This avoids double-counting a wallet top-up and the later wallet spend. If the business wants wallet credits excluded from revenue until they are spent, the report needs an additional accounting policy and corresponding labels. The current report exposes both figures so the distinction is visible instead of hidden.

Fourth, historical reconciliation is still needed before using the report as a formal accounting source. Older activity logs and garage totals may predate the canonical event coverage. A reconciliation job should compare legacy activity records, garage aggregates, delegate aggregates, manual-credit ledger entries, and domain events before any historical correction is applied.

Finally, package editing is currently represented primarily as create and deactivate. If administrators need to edit an active package, the system should use a versioned or explicitly audited update flow. Changing the price or entitlement of an existing package without versioning can make historical records ambiguous.

## Validation status

The changed files pass whitespace and existence checks. Targeted tests cover financial reporting, idempotency, direct recharge, recharge approval, and delegate commission calculations. Full TypeScript, lint, and test results are recorded separately in the final task response after the running validation jobs complete.

## Changed files

- `server/app.ts`
- `server/financialReporting.ts`
- `server/financialReporting.test.ts`
- `src/services/garageService.ts`
- `src/services/adminService.ts`
- `src/components/admin/AdminRequestsView.tsx`
- `src/components/admin/AdminFinancialReportsView.tsx`

## Final assessment

The system is suitable for continued testing, but it should not yet be treated as a fully reconciled accounting system until stale-session authorization, lock enforcement, and historical reconciliation are completed. The money-moving paths reviewed here are now more consistent with common payment-system practice: authoritative server pricing, transactional state changes, idempotent retries, explicit wallet accounting, and user-facing figures that do not claim more precision than the server can guarantee.

## References

[1]: file:///home/ubuntu/RQ/BUSINESS_LOGIC_AUDIT.md "Existing RQ business-logic audit"
[2]: file:///home/ubuntu/RQ/server/routes/recharges.ts "RQ recharge and wallet transaction routes"
[3]: file:///home/ubuntu/RQ/server/financialReporting.ts "RQ financial reporting calculation"
[4]: file:///home/ubuntu/RQ/server/events.ts "RQ domain event ledger"
[5]: file:///home/ubuntu/RQ/server/idempotency.ts "RQ idempotency implementation"
