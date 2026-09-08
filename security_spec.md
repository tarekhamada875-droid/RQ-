# Security Specification

## 1. Data Invariants

- A registered user must be authenticated (`request.auth != null`) to have read or write access to any database collections or sub-collections.
- Balance updates for garages must be restricted: balance increases (recharges) are strictly restricted to Admins (`isAdmin()`) or authorized Delegates (`isDelegate()`), while standard clients/garage operators can only decrease the balance (e.g. commission deductions upon checking in a vehicle).
- Sub-collections (like vehicle entries) can only be added to a garage if the garage is not locked and the garage has a non-negative balance.
- Immutable fields such as `createdAt` and `garageId` must not be changed once created.

## 2. The "Dirty Dozen" Payloads (Vulnerability Test Vectors)

The following payloads attempt to violate identity, integrity, or write restrictions and must fail:

1. **Anonymous unauthenticated user attempting to create a garage**:
   - Path: `/garages/attackerGarage`
   - Payload: `{ name: "Attacker Garage", hourlyRate: 10, balance: 1000 }`
   - Expect: `PERMISSION_DENIED`

2. **Unauthenticated user reading activity logs**:
   - Path: `/activity_logs/someLog`
   - Expect: `PERMISSION_DENIED`

3. **Standard garage user trying to arbitrarily increase balance**:
   - Path: `/garages/garage123`
   - Update Payload: `{ balance: existingBalance + 500 }` (not Admin or Delegate)
   - Expect: `PERMISSION_DENIED`

4. **Spoofing email of Admin**:
   - Expect: A non-verified email or standard email with `email_verified: false` must be blocked from admin access.

5. **Resource Poisoning: Creating a vehicle with a huge string ID**:
   - Path: `/garages/garage123/vehicles/` with ID > 128 characters
   - Expect: `PERMISSION_DENIED` (handled by `isValidId`)

6. **Self-Assigned Admin privileges**:
   - Path: `/delegates/attacker1`
   - Attempting to bypass role rules or setting custom role fields to escape authorization gates.
   - Expect: `PERMISSION_DENIED`

7. **Bypassing Lock status of Garage**:
   - Attempting to check in a vehicle to a locked garage.
   - Expect: `PERMISSION_DENIED`

8. **Overwriting immutable `createdAt`**:
   - Expect: `PERMISSION_DENIED`

9. **Injecting shadow fields onto top-up requests**:
   - Path: `/topup_requests/req123`
   - Payload: `{ garageId: "g1", packageName: "Gold", amount: 100, status: "completed", ghostField: "injected" }`
   - Expect: `PERMISSION_DENIED`

10. **Unauthenticated access to Global Settings**:
    - Path: `/settings/general`
    - Expect: `PERMISSION_DENIED`

11. **Malicious deletion of activity logs**:
    - Path: `/activity_logs/log123` by non-admin
    - Expect: `PERMISSION_DENIED`

12. **Malicious modification of packages list by standard user**:
    - Path: `/packages/package_gold`
    - Expect: `PERMISSION_DENIED`

## 3. Recommended Tests (Conceptual)

All 12 payloads must be verified to return `PERMISSION_DENIED`. The security rules draft and production version will be enforced to satisfy logical validation of these constraints.
