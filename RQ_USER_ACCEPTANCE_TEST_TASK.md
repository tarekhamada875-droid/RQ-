# RQ Human User Acceptance Test Task

## What this test is

This is the test you meant: **use the actual RQ application as a real user**, logging in separately as the platform admin, delegate, garage owner, garage staff member, and supervisor.

Do not inspect source code during this test. Do not run technical commands as a substitute for using the app. The purpose is to answer one practical question:

> Can a real person use every important RQ workflow successfully, with the correct screens, data, permissions, confirmations, errors, and results?

A technical QA task may run separately. This document is the human/browser acceptance task.

## Safety boundary

RQ is currently controlled synthetic pre-production. Use only test accounts and test records. Do not use real garages, real customer vehicles, real financial records, real payment information, or unknown data.

Use names such as:

- `QA Garage Alpha`
- `QA Garage Beta`
- `QA Vehicle 001`
- `QA Subscriber 001`
- `QA Staff Alpha`
- `QA Delegate Alpha`

Do not delete or modify anything unless it is clearly marked as a QA test record. If the screen does not clearly show that a record is synthetic, stop and ask before changing it.

## How to record each test

For every test step, mark one of:

- **PASS** — the screen and result match the expected result.
- **FAIL** — the app crashes, shows wrong data, allows an action that should be forbidden, produces a wrong result, or gives no usable feedback.
- **BLOCKED** — the test cannot be performed because the account, deployment, backend, or test data is unavailable.
- **NOT APPLICABLE** — the feature is not present for this role; explain why.

For each failure, record:

1. Role used.
2. Exact screen and button pressed.
3. Safe test record involved.
4. Expected result.
5. Actual result.
6. Screenshot, if safe.
7. Whether the issue is repeatable.
8. Severity: Blocker, High, Medium, or Low.

Never record passwords, PINs, session tokens, private URLs, or private customer information.

---

# Part 1 — Before starting

## 1.1 Prepare five test identities

Obtain or request five approved synthetic accounts:

| Test identity | Required access |
|---|---|
| `QA Admin` | Platform administrator |
| `QA Delegate` | Delegate dashboard and permitted referred garages |
| `QA Garage Owner` | One garage only |
| `QA Staff` | Staff account assigned to the owner's garage |
| `QA Supervisor` | Supervisor permissions defined by the application |

You also need two synthetic garages:

- **QA Garage Alpha** — the garage used by the owner and staff member.
- **QA Garage Beta** — a different garage used to test isolation.

Prepare these records before the role tests if they do not already exist:

- one active vehicle in Alpha;
- one exited vehicle in Alpha;
- one active monthly subscriber in Alpha;
- one expired subscriber in Alpha;
- one pending recharge request;
- one active package;
- one test staff member in Alpha;
- one delegate related to Alpha but not Beta;
- one supervisor;
- one synthetic balance or credit record;
- one test record in Beta that must never be visible to Alpha users.

## 1.2 Browser preparation

Use a normal browser window for the first test and a private/incognito window for each different role. This prevents one role's local session from appearing in another role.

Before each new role:

1. Log out from the previous role.
2. Close that role's browser window or clear only the RQ site data.
3. Open the RQ application again.
4. Confirm the login page is shown.

If the app supports Arabic and English, run the main happy-path test in the application's default language, then repeat the visual check in the other language.

---

# Part 2 — Basic application test for every role

Perform this short test for **Admin, Delegate, Garage Owner, Staff, and Supervisor**.

| Step | Action | Expected result |
|---:|---|---|
| 1 | Open the application URL | Login screen loads without a blank page or crash |
| 2 | Look at the logo, colors, text direction, and cards | Existing RQ visual style is present |
| 3 | Submit the form with empty fields | Clear validation appears; page does not crash |
| 4 | Enter an intentionally incorrect test credential/PIN | Access is denied with a safe error |
| 5 | Log in with the approved synthetic account | Correct role dashboard opens |
| 6 | Refresh the page | The same valid session remains or the app safely revalidates it |
| 7 | Navigate between the available screens | Navigation works and does not show another role's screens |
| 8 | Open and close a modal or drawer | It opens, closes, and preserves the page layout |
| 9 | Press logout | Local session is cleared and login screen returns |
| 10 | Press the browser Back button after logout | Protected data does not reappear |

If any role cannot complete this basic test, stop that role's detailed test and report the problem first.

---

# Part 3 — Test as Platform Admin

Log in as **QA Admin**.

## 3.1 Admin dashboard and navigation

1. Confirm the dashboard identifies the account as an administrator.
2. Review every admin navigation item.
3. Open each available admin screen once.
4. Confirm loading states are understandable.
5. Confirm empty states are not broken blank areas.
6. Confirm errors have an understandable message and a retry path.
7. Confirm the dashboard does not show records from outside the intended platform scope.
8. Change the language if the application supports it and confirm the layout remains usable.
9. Resize the browser to a mobile width and open the navigation drawer.
10. Confirm cards, tables, buttons, and modals remain readable.

Expected result: admin navigation is complete, stable, and visually consistent with RQ.

## 3.2 Create and edit a garage

Use a new synthetic record named `QA Garage Alpha New` if creation is safe and available.

1. Open garage management.
2. Choose the action to create a garage.
3. Submit with required fields empty.
4. Confirm field validation appears.
5. Enter the synthetic garage information.
6. Save it.
7. Confirm a success message appears.
8. Find the new garage in the list.
9. Open its details.
10. Edit one non-sensitive field.
11. Save the change.
12. Refresh the page.
13. Confirm the change remains.
14. Cancel an edit before saving.
15. Confirm the unsaved change does not overwrite the saved value.

Expected result: creation, validation, editing, cancellation, refresh, and persistence all work.

## 3.3 Garage status and maintenance

Using only a QA garage:

1. Open garage details.
2. Review active/locked/suspended status controls.
3. Change the status only if this is an approved synthetic test.
4. Confirm the status is visible after refresh.
5. Try the appropriate maintenance action.
6. Confirm the app asks for confirmation before a destructive action.
7. Cancel the confirmation.
8. Confirm nothing changed.
9. Repeat and confirm the action only affects the selected QA garage.
10. Open Garage Beta and confirm its data did not change.

Expected result: status and maintenance controls are scoped, confirmed, auditable, and non-destructive to other garages.

## 3.4 Staff management

1. Open the selected garage's staff section.
2. Add `QA Staff New` if safe.
3. Submit invalid or incomplete information.
4. Confirm validation.
5. Save valid synthetic staff data.
6. Confirm the staff member appears under the correct garage.
7. Edit the staff member.
8. Disable or change the staff status if available.
9. Confirm the change after refresh.
10. Try to assign the staff member to the wrong garage, if the UI allows selecting a garage.
11. Confirm the application rejects the invalid scope.

Expected result: staff records are created and managed without cross-garage assignment.

## 3.5 Delegate management

1. Open delegate management.
2. Create or open `QA Delegate Alpha`.
3. Review the delegate's related garages.
4. Confirm Alpha is visible if it is assigned.
5. Confirm Beta is not visible if it is not assigned.
6. Open delegate details.
7. Review commissions, requests, and activity fields.
8. Edit one permitted field.
9. Save and refresh.
10. Confirm the data remains correct.

Expected result: the admin can manage the delegate, while the delegate relationship and financial scope remain clear.

## 3.6 Supervisor management

1. Open supervisor management.
2. Create or open `QA Supervisor`.
3. Review its assigned scope.
4. Change a permitted assignment if safe.
5. Save and refresh.
6. Confirm the supervisor's scope is shown correctly.
7. Confirm a supervisor is not accidentally granted full admin access by the UI.

## 3.7 Packages and system settings

1. Open package or subscription settings.
2. Review existing package types.
3. Confirm the UI does not show only one hardcoded duration if more are supported.
4. Open the system settings screen.
5. Locate the configurable monthly subscriber fee if present.
6. Record the current displayed value without changing it.
7. If an approved test change is allowed, change it to a clearly synthetic value.
8. Save it.
9. Refresh the page.
10. Confirm the value persists.
11. Restore the original approved value.
12. Confirm the subscriber screens use the configured setting rather than a permanently hardcoded value.

Do not change real business pricing or billing settings during this test.

## 3.8 Admin reports and financial views

1. Open the admin reports or financial reports screen.
2. Review the displayed period and currency.
3. Confirm platform subscription revenue is distinguished from garage/customer revenue.
4. Confirm unavailable data is labeled unavailable rather than invented.
5. Open the partner/delegate calculator if present.
6. Confirm it uses the intended current-period data.
7. Confirm it is labeled as an estimate if it is not an accounting ledger.
8. Open a report with no data, if available safely.
9. Confirm the empty state is clear.

## 3.9 Admin audit and sessions

1. Open audit/activity logs.
2. Confirm your recent synthetic admin actions appear.
3. Confirm the actor, action, target, and time are understandable.
4. Confirm no PIN, password, token, or secret is displayed.
5. Open active sessions if available.
6. Confirm only safe session information is shown.
7. Revoke only a synthetic test session if the test account is approved for it.
8. Confirm that session can no longer access protected pages.

## 3.10 Admin denial test

While still logged in as admin, attempt only through the normal interface to open a garage-owned screen that should not be available to the admin, if such a boundary exists. Record whether the UI gives a safe access-denied result or intentionally provides the admin equivalent.

---

# Part 4 — Test as Delegate

Log out completely, open a private window, and log in as **QA Delegate**.

## 4.1 Delegate dashboard

1. Confirm the delegate dashboard opens.
2. Confirm the delegate name and role are correct.
3. Confirm the related Garage Alpha appears.
4. Confirm unrelated Garage Beta does not appear.
5. Review garage counts, requests, commissions, and activity.
6. Confirm values are not all incorrectly zero when synthetic data exists.
7. Refresh the page.
8. Confirm the values remain consistent.
9. Open each delegate navigation item.
10. Confirm admin-only screens are not shown.

## 4.2 Delegate subscription or recharge request

1. Select the permitted Garage Alpha.
2. Start a subscription/recharge request.
3. Enter a synthetic package or duration.
4. Submit the request.
5. Confirm a pending/success state appears.
6. Return to the dashboard.
7. Confirm the request appears in the correct list.
8. Confirm the amount and garage are correct.
9. Try to submit the same request twice only if duplicate testing is approved.
10. Confirm the app does not create an unintended duplicate.

## 4.3 Delegate commission view

1. Open the commission or earnings section.
2. Review the displayed commission.
3. Compare it with the approved synthetic package and policy.
4. Confirm the amount is not attributed to another delegate.
5. Confirm expired or ineligible referral records are treated according to the approved policy.
6. Confirm no sensitive financial information from unrelated garages appears.

## 4.4 Delegate denial tests

Try the following through the visible UI or by opening a copied URL from a permitted page:

- Garage Beta details.
- Admin settings.
- Admin garage deletion.
- Another delegate's records.
- Staff management outside permitted scope.
- Approval of a request that belongs to someone else.

Expected result: access is denied or the record is not shown. The app must not crash or reveal details.

---

# Part 5 — Test as Garage Owner

Log out, open a new private window, and log in as **QA Garage Owner**.

## 5.1 Garage owner dashboard

1. Confirm the dashboard identifies Garage Alpha.
2. Confirm Garage Beta is never shown.
3. Review balance, subscription status, capacity, active vehicles, and today's activity.
4. Open the monthly subscriber area.
5. Open the package/balance area.
6. Open the staff area if owners are allowed to use it.
7. Refresh each screen.
8. Confirm the data remains consistent and the page does not become blank.

## 5.2 Add and manage a vehicle

Use `QA Vehicle 001`.

1. Open vehicle check-in.
2. Submit without a plate.
3. Confirm validation.
4. Enter a valid synthetic plate.
5. Check the vehicle in.
6. Confirm a success message and visible active-vehicle row.
7. Refresh.
8. Confirm the vehicle remains active.
9. Try to check in the same plate again.
10. Confirm the duplicate is rejected or handled by the documented subscriber rule.
11. Select the active vehicle.
12. Check it out.
13. Confirm it leaves the active list and appears in today's completed activity.
14. Refresh and confirm the final state.

## 5.3 Vehicle input and operational rules

Test with synthetic records:

- English digits.
- Arabic digits.
- Extra spaces.
- Invalid plate format.
- A vehicle already inside.
- A vehicle already checked out.
- A locked or suspended garage, only if approved.
- Capacity reached, only if approved.

Expected result: validation is clear, the correct operational rule is applied, and no duplicate transition occurs.

## 5.4 Monthly subscribers

Use `QA Subscriber 001`.

1. Open monthly subscribers.
2. Add a subscriber with valid synthetic details.
3. Submit incomplete details.
4. Confirm validation.
5. Save valid details.
6. Confirm the subscriber appears.
7. Open the subscriber.
8. Renew or extend the subscription using the approved test package.
9. Confirm the new dates are correct.
10. Refresh and confirm the dates remain correct.
11. Attempt an invalid date range.
12. Confirm it is rejected.
13. Try to change an immutable plate if the UI provides that action.
14. Confirm the application prevents an unsafe change.
15. Delete only the QA subscriber if the test boundary permits it.
16. Confirm the result and audit message.

## 5.5 Balance, packages, and recharge

1. Open the balance or subscription screen.
2. Review the current balance and expiry.
3. Select a valid synthetic package.
4. Submit a recharge or renewal request through the owner workflow.
5. Confirm the request state.
6. Refresh.
7. Confirm the state is not duplicated.
8. Submit invalid amount or package data if the UI allows manual entry.
9. Confirm validation.
10. Confirm the owner cannot approve an admin-only transaction unless the product explicitly allows it.

## 5.6 Garage owner staff view

1. Open staff management if available.
2. Confirm only Garage Alpha staff appear.
3. Open `QA Staff Alpha`.
4. Verify the displayed role and status.
5. Confirm PIN hashes, password values, and private authentication metadata are not shown.
6. Attempt to view Garage Beta staff through any visible filter or copied route.
7. Confirm denial or empty result.

---

# Part 6 — Test as Staff Member

Log out, open a new private window, and log in as **QA Staff**.

## 6.1 Staff landing screen

1. Confirm the staff identity and Garage Alpha are displayed.
2. Confirm the staff member does not see admin settings.
3. Confirm the staff member does not see delegate management.
4. Confirm the staff member does not see supervisor-only controls.
5. Confirm the staff member sees only the operational screens intended for staff.

## 6.2 Staff vehicle workflow

Repeat the complete vehicle test:

1. Check in a new synthetic vehicle.
2. Confirm the staff name appears correctly in the operation if displayed.
3. Check out the vehicle.
4. Confirm today's activity shows the correct staff attribution.
5. Try a duplicate check-in.
6. Try to operate on a Garage Beta vehicle.
7. Confirm the cross-garage action fails.
8. Open and cancel a destructive correction/delete confirmation.
9. Confirm cancellation changes nothing.

## 6.3 Staff subscriber visibility

1. Open subscriber search/list if available.
2. Find the QA subscriber in Alpha.
3. Confirm only the permitted fields are visible.
4. Try to edit a subscriber field.
5. Confirm only authorized fields/actions are enabled.
6. Try to open a Beta subscriber through a copied route.
7. Confirm access is denied.

## 6.4 Staff logout and session

1. Refresh the page while logged in.
2. Confirm the session is still valid.
3. Log out.
4. Use Back and refresh.
5. Confirm protected staff data does not return.
6. Reopen the app and confirm the login screen appears.

---

# Part 7 — Test as Supervisor

Log out, open a new private window, and log in as **QA Supervisor**.

## 7.1 Supervisor dashboard and scope

1. Confirm the supervisor identity and permitted scope.
2. Confirm the available navigation matches the supervisor role.
3. Confirm the supervisor does not automatically receive full admin controls.
4. Confirm only permitted garages, records, and reports are visible.
5. Refresh and repeat the scope check.

## 7.2 Supervisor operational review

1. Open permitted garage details.
2. Review vehicles, activity, subscriber status, or maintenance information allowed by the role.
3. Open a permitted report.
4. Confirm the report scope is correct.
5. Attempt an admin-only setting change.
6. Confirm it is unavailable or denied.
7. Attempt a delegate-only action.
8. Confirm it is unavailable or denied.
9. Attempt to open Garage Beta if it is outside supervisor scope.
10. Confirm the action fails safely.

## 7.3 Supervisor session and logout

1. Refresh the page.
2. Confirm the session remains valid.
3. Log out.
4. Press Back.
5. Confirm no protected supervisor data is visible.
6. Attempt to reopen a protected supervisor URL.
7. Confirm the login screen or access-denied screen appears.

---

# Part 8 — Two-device same-account test

This test must be done with a synthetic account only.

1. Open Browser A and log in as the approved synthetic garage owner.
2. Open Browser B or a second device and log in with the same account.
3. Confirm both sessions show the correct garage.
4. Perform a harmless refresh in both browsers.
5. Make one approved synthetic change in Browser A.
6. Confirm Browser B receives the change after refresh or synchronization.
7. Log out from one browser.
8. Observe the other browser according to the documented session policy.
9. Try one harmless protected action from the logged-out browser.
10. Confirm the old session is either intentionally retained or denied according to the approved policy.
11. Record the exact behavior; do not assume it is correct merely because it is consistent.

---

# Part 9 — Mobile and PWA user test

Repeat the basic login, dashboard, vehicle, subscriber, and logout paths on a phone-sized viewport.

Check:

- login form is usable;
- keyboard does not hide the submit button;
- navigation drawer opens and closes;
- cards do not overlap;
- tables scroll or adapt correctly;
- modals fit the screen;
- buttons are easy to tap;
- Arabic RTL alignment remains correct;
- numeric and plate inputs are usable;
- loading indicators appear during saves;
- errors do not leave a blank page;
- logout works from the mobile layout.

If the app is installable as a PWA:

1. Install it with a synthetic account.
2. Close it.
3. Reopen it from the installed icon.
4. Confirm the correct login/session state.
5. Log out.
6. Reopen it.
7. Confirm another account cannot inherit the previous account's protected data.

---

# Part 10 — Final user decision

After all five role tests, answer these questions in plain English:

1. Can I log in as every required role?
2. Does every role see the correct dashboard?
3. Can the admin manage the platform without exposing secrets?
4. Can the delegate see only the garages and data assigned to the delegate?
5. Can the garage owner perform normal garage operations?
6. Can staff perform their work without receiving owner/admin powers?
7. Can the supervisor review only the allowed information?
8. Do vehicle operations work from start to finish?
9. Do subscriber and package workflows work from start to finish?
10. Do balance/recharge flows show correct results?
11. Are wrong-role and wrong-garage actions denied?
12. Does logout actually protect the next page and browser Back button?
13. Does the app work on mobile?
14. Did any screen show wrong data, zero data, stale data, or data belonging to another role?
15. Would I trust a real garage owner to use this without an agent standing beside them?

## Final classification

Use one of these decisions:

- **PASS** — every required role completed its main workflows, no security/scope issue occurred, and no Blocker or High defect remains.
- **PASS WITH FIXES** — the main workflows work, but Medium/Low defects must be recorded and repaired before wider rollout.
- **FAIL** — a role cannot complete its main workflow, wrong data appears, a forbidden action succeeds, logout fails, financial data is wrong, or the app is too confusing to use safely.
- **BLOCKED** — the test could not be completed because the deployment, accounts, or synthetic test data were unavailable.

## User test report template

```markdown
# RQ Human User Acceptance Test Report

Date:
Application URL:
Browser/device:
Language:
Commit or release, if known:

## Accounts tested
- Admin:
- Delegate:
- Garage owner:
- Staff:
- Supervisor:

## Role results
| Role | Login | Dashboard | Main workflow | Scope correct | Logout | Result |
|---|---|---|---|---|---|---|
| Admin |  |  |  |  |  |  |
| Delegate |  |  |  |  |  |  |
| Garage owner |  |  |  |  |  |  |
| Staff |  |  |  |  |  |  |
| Supervisor |  |  |  |  |  |  |

## Main feature results
| Feature | Result | Notes |
|---|---|---|
| Garage management |  |  |
| Staff management |  |  |
| Delegate dashboard |  |  |
| Supervisor views |  |  |
| Vehicle check-in |  |  |
| Vehicle check-out |  |  |
| Vehicle correction/deletion |  |  |
| Subscribers |  |  |
| Packages and balances |  |  |
| Recharge/manual credit |  |  |
| Reports |  |  |
| Audit/session views |  |  |
| Mobile/PWA |  |  |
| Two-device session |  |  |

## Defects
1. Role:
   - Screen/action:
   - Expected:
   - Actual:
   - Severity:
   - Reproducible: yes/no
   - Safe evidence:

## Final decision
PASS | PASS WITH FIXES | FAIL | BLOCKED

## Plain-English recommendation
Would I allow a real user to use the application? Why or why not?
```

This document is intentionally separate from the technical production-gate task. The technical task checks code, APIs, CI, transactions, and deployment internals. **This task checks whether you and the other users can actually use RQ successfully.**


---

# Part 11 — Additional current RQ screens and actions

This section was added after comparing the user task against the current RQ interface. It prevents the role test from skipping screens that are easy to miss inside menus, drawers, or settings cards.

## 11.1 Admin requests and reviews

As **QA Admin**:

1. Open the requests/reviews screen.
2. Confirm pending garage-creation requests are visible.
3. Confirm pending recharge requests are visible.
4. Open one synthetic request.
5. Review garage, requester, package, amount, and request status.
6. Cancel the approval dialog and confirm nothing changes.
7. Approve one synthetic request if approval is authorized for this test.
8. Confirm the request changes to the correct final status.
9. Confirm the target synthetic garage/balance/package changes correctly.
10. Confirm a second approval of the same request is prevented.
11. Reject a different synthetic request if authorized.
12. Confirm the rejection is visible and the underlying record is handled according to the displayed warning.
13. Refresh the screen and confirm the result remains correct.

## 11.2 Trial-lead follow-up and expired trials

As **QA Admin**:

1. Open trial follow-up/leads.
2. Find a synthetic trial garage.
3. Review its trial status and decision.
4. Select the continue, decline, dismiss, or resolve action if shown.
5. Confirm the application displays the consequence before saving.
6. Confirm the action changes only the selected synthetic garage.
7. Refresh and confirm the decision remains.
8. Open the garage as the owner after the trial expires.
9. Confirm the trial-expiry screen appears only for an actual undecided trial.
10. Choose the displayed continue/decline/dismiss option as approved.
11. Confirm the result is saved and the modal does not reappear incorrectly.

## 11.3 Fair-use management

As **QA Admin**:

1. Open the fair-use screen.
2. Review garages with unlimited/fair-use packages.
3. Open a synthetic garage's fair-use details.
4. Confirm current allowance, usage, and expiry information are understandable.
5. Use the approved synthetic extension action.
6. Confirm the app asks for confirmation.
7. Cancel once and confirm no change.
8. Confirm the extension once and verify the new value after refresh.
9. Confirm a non-unlimited garage cannot receive an inappropriate fair-use extension.

As **QA Garage Owner**:

1. Check in synthetic vehicles until the approved fair-use boundary is reached.
2. Confirm the application shows the expected warning or automatic extension behavior.
3. Confirm no duplicate vehicle or duplicate extension is created.

## 11.4 Admin wallet number and manual wallet top-up

As **QA Admin**:

1. Open Settings and then the wallet-number screen.
2. Confirm the current synthetic wallet number is displayed safely.
3. Edit it with an invalid value and confirm validation.
4. Save an approved synthetic value.
5. Refresh and confirm persistence.
6. Open the manual wallet/balance top-up workflow.
7. Select a synthetic garage.
8. Enter a valid synthetic amount and reference.
9. Review the confirmation.
10. Cancel and confirm the balance does not change.
11. Repeat and confirm the balance, activity, and audit result update once.
12. Confirm the same action cannot be accidentally applied twice by double-clicking.

Do not enter a real wallet number, bank reference, card number, or real payment information.

## 11.5 Admin PIN and account security settings

As **QA Admin**:

1. Open the admin PIN/security screen.
2. Review the current state without exposing the PIN in a screenshot.
3. Start a PIN change using an approved synthetic value.
4. Enter mismatched confirmation values.
5. Confirm the change is rejected.
6. Complete a valid synthetic PIN change if approved.
7. Log out.
8. Log in using the new synthetic PIN.
9. Confirm the old synthetic PIN no longer works.
10. Confirm the PIN is never displayed in clear text in a list, error, URL, or browser storage view.
11. Restore the approved test credential using the safe account procedure.

## 11.6 Admin announcements

As **QA Admin**:

1. Open platform announcements.
2. Create a synthetic announcement with a clear QA title.
3. Submit invalid or empty content and confirm validation.
4. Save the valid announcement.
5. Confirm it appears in the admin list.
6. Toggle its active/inactive state.
7. Edit it and save.
8. Delete it only if the QA cleanup boundary allows it.
9. Log in as Garage Owner and confirm the active announcement appears in the expected announcement modal or notice area.
10. Confirm an inactive announcement is not shown as active.
11. Log in as Staff and confirm the announcement behavior matches the intended role policy.

## 11.7 Admin appearance and language

As **QA Admin**:

1. Open appearance settings.
2. Change only an approved synthetic theme/color preference.
3. Confirm the dashboard updates without losing data.
4. Refresh and confirm the preference behavior.
5. Switch Arabic/English if available.
6. Confirm labels, direction, numbers, buttons, and modal alignment remain usable.
7. Restore the approved appearance setting.

## 11.8 Garage-owner drawer screens

As **QA Garage Owner**, open the garage menu/drawer and test each visible item:

- subscriber management;
- smart reports;
- packages and balance recharge;
- recharge history;
- staff statistics;
- appearance settings;
- terms and conditions;
- announcements;
- recharge-success notification, when a synthetic recharge is approved;
- trial-expiry notice, for a synthetic trial garage.

For each item:

1. Open it.
2. Confirm its data belongs to the current garage.
3. Close it using its close button.
4. Reopen it and confirm it does not duplicate content.
5. Refresh the page and confirm the main dashboard remains intact.

Additional checks:

- Staff must not see owner-only reports or staff-statistics controls if the UI hides them.
- Recharge history must distinguish pending, approved, rejected, and failed states.
- Terms must close without changing application data.
- Plate lookup/recent-exit warnings must return the correct synthetic record or a clear empty state.
- Appearance changes must not change authorization.

## 11.9 Delegate create-garage and trial request

As **QA Delegate**:

1. Open the add/create-garage action.
2. Confirm the screen says the request goes to admin review when that is the product policy.
3. Submit empty and invalid values and confirm validation.
4. Create a synthetic garage request.
5. Toggle the free-trial option if shown.
6. Confirm the trial days are displayed clearly.
7. Confirm the generated synthetic PIN is not reused by another account.
8. Submit the request.
9. Confirm the request is pending rather than incorrectly active.
10. Log in as QA Admin and review the request.
11. Approve it only if this synthetic test is authorized.
12. Return as delegate and confirm the resulting garage appears only after the intended approval state.
13. Confirm delegate creation limits or daily limits are enforced when applicable.

## 11.10 Delegate account settlement and history

As **QA Admin**, open a synthetic delegate's details:

1. Review recharge/request history.
2. Change the period/month filter.
3. Confirm totals and commissions change to the selected period.
4. Confirm empty-period behavior is clear.
5. Open the settlement action.
6. Cancel the confirmation and confirm no settlement timestamp is added.
7. Confirm settlement using a synthetic delegate.
8. Refresh and confirm the settlement timestamp and historical records remain.
9. Confirm a duplicate settlement does not erase historical activity.
10. Revoke a synthetic delegate only if approved.
11. Confirm the delegate cannot log in or recharge after revocation.

## 11.11 Staff statistics and operational activity

As **QA Garage Owner**:

1. Open staff statistics.
2. Confirm only current-garage staff and activity are shown.
3. Compare a synthetic staff member's check-in/check-out activity with the activity list.
4. Confirm dates and totals are understandable.
5. Confirm an empty staff state is handled.
6. Confirm the staff member cannot view owner-only statistics unless explicitly allowed.

## 11.12 Plate lookup and recent-exit warning

As **QA Garage Owner** or the permitted staff role:

1. Open plate lookup.
2. Search for the active synthetic plate.
3. Confirm the correct vehicle/subscriber result.
4. Search for an unknown synthetic plate.
5. Confirm a clear empty state.
6. Check in a plate that recently exited, if this warning is enabled.
7. Confirm the recent-exit warning appears before a duplicate action.
8. Cancel the warning and confirm no new vehicle is created.
9. Continue only if the business rule permits it and confirm the final state.

## 11.13 Network/offline behavior from a user perspective

For each role's main workflow:

1. Open the application while online.
2. Disconnect the browser network or use an approved offline simulation.
3. Attempt a protected save.
4. Confirm the app shows an offline/error state rather than claiming success.
5. Reconnect.
6. Refresh or retry.
7. Confirm only the server-confirmed result is shown.
8. Confirm no duplicate action occurred.

## 11.14 Updated role-by-feature checklist

| Feature | Admin | Delegate | Garage owner | Staff | Supervisor |
|---|---:|---:|---:|---:|---:|
| Dashboard and navigation | ✓ | ✓ | ✓ | ✓ | ✓ |
| Garage create/approve | ✓ | request only | own view | no | no |
| Garage edit/status | ✓ | permitted request/view | own permitted fields | no/limited | permitted scope only |
| Staff management | ✓ | no | permitted owner flow | own profile/limited | no |
| Delegate management | ✓ | own dashboard | no | no | restricted review only |
| Supervisor management | ✓ | no | no | no | no |
| Recharge requests | approve/reject | create/view own | create/view own | view/limited | permitted review only |
| Manual wallet top-up | ✓ | no | no | no | no |
| Trial leads/decisions | ✓ | create trial request | receive trial state | no | no |
| Fair-use controls | ✓ | no | observe/use | observe only | no |
| Packages/balances | configure/approve | request | use/request | use if allowed | view if allowed |
| Subscribers | platform visibility | scoped visibility | manage own | scoped visibility | scoped review |
| Vehicles | platform visibility | no/limited | operate own | operate assigned garage | scoped review |
| Reports | platform | commission/activity | own garage | limited/none | permitted scope |
| Staff statistics | platform/garage detail | no | own garage | limited/none | permitted scope |
| Announcements | create/publish | receive | receive | receive | receive |
| Appearance/settings | platform | own allowed view | own allowed view | own allowed view | restricted |
| Admin PIN/security | ✓ | no | no | no | no |
| Sessions/logout | manage/revoke | own | own | own | own |
| Audit/history | platform | own history | own history | own activity | permitted scope |
