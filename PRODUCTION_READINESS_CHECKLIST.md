# RQ Production-Readiness Checklist and Launch Timeline

**Project:** RQ garage-management system  
**Architecture:** React/Vite frontend on Cloudflare Pages, Node.js/Express backend on Vercel, Firebase Authentication and Firestore  
**Release baseline:** Commit `032bb88`  
**Prepared by:** Manus AI  
**Purpose:** Establish evidence-based go/no-go criteria before real garages and paying customers depend on the service.

## Executive decision rule

Do not treat a passing automated test suite as the complete production approval. The service is ready for a public commercial launch only when all seven readiness areas below have a named owner, recorded evidence, and no unresolved **Blocker** or **Critical** item.

A **private pilot** may begin earlier, but only after the deployment, smoke-test, backup, security, and rollback gates are complete. The pilot should use one or two trusted garages and should not yet be marketed as a service with guaranteed uninterrupted availability.

> **Public launch gate:** every mandatory item is complete, the rollback has been rehearsed, recovery has been demonstrated, and the pilot has completed without an unresolved customer-impacting incident.

## Status vocabulary

| Status | Meaning | Release effect |
|---|---|---|
| Not started | No work or evidence exists | Cannot pass the relevant gate |
| In progress | Work is being performed | Cannot pass the relevant gate |
| Passed | Evidence is recorded and independently checked | Eligible for sign-off |
| Exception | A known deviation has an owner, deadline, mitigation, and explicit approval | May proceed only if it is not a blocker |
| Blocked | A failure affects data integrity, authentication, security, recovery, or core customer operation | Release stops |

## Required evidence pack

Create one release folder or document containing the following evidence. The evidence should identify the release commit, date, person who performed the check, result, and links to logs or screenshots.

1. Release commit, build output, test output, and `git status` result.
2. Vercel deployment URL, deployment status, backend version, and rollback target.
3. Cloudflare Pages deployment URL, domain result, cache/PWA result, and rollback target.
4. Firebase project, rules deployment result, index status, backup/export result, and billing alert configuration.
5. Environment-variable inventory showing names, source, owner, and last verification date. Do not store secret values in the evidence pack.
6. End-to-end smoke-test results for authentication, garage operations, financial operations, dashboards, and admin actions.
7. Recovery drill result, including the time required to detect, decide, roll back, and restore.
8. Security review result and dependency-audit disposition.
9. Pilot log containing incidents, user feedback, response times, and final approval.

## Step 1 — Verify the deployment

**Objective:** Prove that the exact tested release is deployed correctly on Cloudflare, Vercel, and Firebase.

### Repository and build checks

- [ ] Confirm the release branch contains the intended commit and no uncommitted changes.
- [ ] Run `npm ci` from a clean checkout.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build:web` and confirm the frontend build succeeds.
- [ ] Run `npm run ci:check` and retain the output. This repository check validates the lockfile install, secret scan, typecheck, tests, production build, and required artifacts.
- [ ] Confirm the generated `api/index.js` bundle is produced only during the build and is not committed to source control.
- [ ] Record the exact commit SHA in the release evidence.

### Vercel backend checks

- [ ] Confirm the Vercel project is connected to the intended repository and production branch.
- [ ] Confirm the deployment uses the intended Node.js runtime and the lockfile-based install.
- [ ] Compare production environment-variable names with `.env.example` and the approved inventory.
- [ ] Confirm Firebase Admin credentials are configured only in Vercel server-side environment variables.
- [ ] Confirm no frontend-exposed variable contains a private key, admin credential, or privileged API token.
- [ ] Confirm the Vercel deployment reports **Ready** and that its commit SHA matches the release evidence.
- [ ] Run `npm run release:smoke` with `SMOKE_BASE_URL` set to the production API/frontend URL and `SMOKE_EXPECTED_VERSION` set to the release version or commit identifier.
- [ ] Confirm `/api/health` reports an acceptable status, confirms the Admin SDK is initialized, and reports a non-unknown version.
- [ ] Confirm backend logs contain no startup errors, repeated authentication failures, unhandled promise rejections, or database connection failures.

### Cloudflare frontend checks

- [ ] Confirm the Cloudflare Pages production deployment uses the same release commit.
- [ ] Open the real customer domain in a private browser window and confirm the application loads over HTTPS.
- [ ] Confirm the frontend API base URL points to the production Vercel backend, not localhost, a preview deployment, or an old domain.
- [ ] Confirm CORS allows the production frontend origin and does not broadly allow arbitrary origins.
- [ ] Confirm the service worker and cache do not serve stale JavaScript after a new deployment. Test a new deployment version in a clean browser profile.
- [ ] Confirm the custom domain, DNS, TLS certificate, redirects, and error pages work as expected.
- [ ] Confirm browser developer tools show no failed API calls, mixed-content errors, exposed secrets, or unexpected console errors during the smoke test.

### Firebase checks

- [ ] Confirm the frontend and backend point to the intended Firebase project and not a development or personal test project.
- [ ] Deploy and verify Firestore rules from the release commit.
- [ ] Confirm required Firestore indexes exist and are not still building.
- [ ] Confirm Authentication providers, authorized domains, email/phone settings, and session behavior match the business plan.
- [ ] Confirm the Firebase project is on the intended billing plan and has budget alerts or equivalent usage alerts.
- [ ] Confirm production data is not mixed with test accounts or test garages.

**Pass condition:** the exact release commit is deployed to both platforms, the production health check passes, the frontend reaches the backend, and Firebase is confirmed as the intended project with the intended rules and indexes.

## Step 2 — Run real production smoke tests

**Objective:** Verify the complete customer workflows against the deployed system using a controlled test account and test garage.

Use a dedicated test garage and test vehicles. Do not use a paying customer’s data for the first smoke test. Record the expected result and actual result for every case.

### Authentication and session tests

- [ ] Garage owner can log in with valid credentials.
- [ ] Invalid credentials are rejected without revealing whether the account exists.
- [ ] Logout invalidates the active session.
- [ ] A second browser cannot use an expired or released session unexpectedly.
- [ ] Admin login and admin logout work separately from garage-owner login.
- [ ] A disabled, inactive, or unauthorized account cannot access tenant data.
- [ ] Direct API requests without valid authentication are rejected.

### Garage and vehicle operations

- [ ] Create or locate the controlled test garage.
- [ ] Register a test vehicle or use an existing test vehicle.
- [ ] Check a vehicle in.
- [ ] Confirm the vehicle appears once in the active vehicle list.
- [ ] Check the same vehicle out.
- [ ] Confirm active counts, exit counts, timestamps, and displayed status are correct.
- [ ] Repeat check-in and check-out concurrently from two sessions where safe to do so.
- [ ] Confirm only one valid state transition is committed and no negative count or duplicate event appears.
- [ ] Verify that refresh, logout, and re-login do not lose the committed state.

### Financial and recharge workflows

- [ ] Create a controlled recharge or package operation using a test amount.
- [ ] Confirm the balance and package state change exactly once.
- [ ] Repeat the same request with the same idempotency key and confirm the cached result is returned without a second financial effect.
- [ ] Reuse the same idempotency key with different parameters and confirm the request is rejected.
- [ ] Confirm failed or aborted transactions do not leave a partial balance, event, or projection update.
- [ ] Confirm refund or approval permissions match the role model.
- [ ] Verify the audit/activity record contains the expected actor, time, amount, and operation identifier.

### Dashboard and projection workflows

- [ ] Load the garage dashboard after vehicle mutations.
- [ ] Confirm the summary matches the underlying test events.
- [ ] Confirm stale or differently dated summaries are not presented as current data.
- [ ] Run a controlled summary rebuild with a valid date.
- [ ] Confirm invalid dates such as `2026-02-29` and malformed values are rejected.
- [ ] Confirm the dashboard still responds correctly when a projection is not ready and returns the documented not-ready response.
- [ ] Confirm sharded projection totals remain correct after repeated operations and retries.

### Admin workflows

- [ ] Admin can view the expected garage list and details.
- [ ] Admin cannot access data outside the intended authorization boundary.
- [ ] Admin actions create the expected audit records.
- [ ] Account suspension, package changes, and relevant operational settings behave as intended.
- [ ] Destructive actions require the intended role and confirmation path.

**Pass condition:** all critical customer workflows pass on the deployed environment, including at least one duplicate/retry test and one safe concurrent-operation test.

## Step 3 — Prove backup and recovery

**Objective:** Make data loss recoverable and demonstrate the recovery procedure before customers depend on the system.

### Backup configuration

- [ ] Identify the Firebase project and all collections that contain business-critical data.
- [ ] Configure scheduled Firestore exports or an equivalent approved backup process.
- [ ] Store backups in a separate protected location with restricted access.
- [ ] Define retention periods for daily, weekly, and monthly recovery points.
- [ ] Confirm backup jobs report success and generate an alert on failure.
- [ ] Confirm backups do not expose credentials or unrestricted customer data.
- [ ] Document who can start a restore and who approves a production restore.

### Recovery drill

- [ ] Restore a recent backup into a non-production Firebase project or isolated namespace.
- [ ] Confirm users, garages, vehicles, events, financial records, and audit records are present as expected.
- [ ] Confirm the backend can connect to the restored environment using a controlled configuration.
- [ ] Measure the recovery point objective: how much recent data could be lost.
- [ ] Measure the recovery time objective: how long until the service can operate again.
- [ ] Record every command, decision, error, and correction in the recovery runbook.
- [ ] Repeat the drill after major schema, rules, or deployment changes.

### Minimum recovery targets

Set explicit targets before launch. A reasonable initial target for a small service is **RPO of 24 hours or better** and **RTO of 4 hours or better**, unless the business requires stricter values. RPO means the maximum acceptable amount of data that could be lost. RTO means the maximum acceptable time to restore service.

**Blocker conditions:** no verified backup, no restore access, inability to identify the correct Firebase project, or inability to restore a representative test dataset.

## Step 4 — Establish operational protection

**Objective:** Detect failures quickly, limit their impact, and provide a tested response path.

### Monitoring and alerting

- [ ] Monitor Vercel function errors, latency, invocation volume, and timeout rates.
- [ ] Monitor Cloudflare Pages availability, error responses, and deployment status.
- [ ] Monitor Firebase read/write volume, authentication failures, quota usage, storage, and billing.
- [ ] Define alert thresholds for repeated 5xx responses, authentication failure spikes, unusual writes, and budget growth.
- [ ] Confirm alerts reach a person who will respond, not only an unmonitored dashboard.
- [ ] Perform a test alert and record who acknowledged it and how quickly.
- [ ] Ensure logs do not contain passwords, private keys, full payment secrets, or unnecessary personal data.

### Incident response

- [ ] Create a one-page incident runbook with severity levels, first actions, escalation contacts, and customer communication templates.
- [ ] Define a **Severity 1** incident as data loss/corruption, unauthorized access, widespread inability to operate, or a financial-integrity failure.
- [ ] Define a **Severity 2** incident as a major workflow failure affecting multiple garages without evidence of data corruption.
- [ ] Define a **Severity 3** incident as a limited defect with a workaround and no material data or financial risk.
- [ ] Establish target response times. For example: acknowledge Severity 1 within 15 minutes, begin containment immediately, and communicate status on a fixed cadence.
- [ ] Record incidents, root causes, affected users, actions taken, and follow-up work.

### Rollback

- [ ] Identify the last known-good Vercel deployment.
- [ ] Identify the last known-good Cloudflare Pages deployment.
- [ ] Confirm rollback does not require rebuilding from an unverified local machine.
- [ ] Rehearse frontend rollback and backend rollback independently.
- [ ] Define when a rollback is safer than a forward fix.
- [ ] Confirm database schema and rules changes are backward-compatible with the rollback target.

**Pass condition:** an alert is received, a rollback is completed, and the responsible person can explain how to restore service without guessing.

## Step 5 — Perform load and concurrency testing

**Objective:** Verify correctness and cost behavior under realistic simultaneous use.

Do not begin with a large stress test against production. Start against a staging Firebase project or a clearly isolated test tenant. Use production only for a small, approved smoke load that cannot affect customer data.

### Workload model

Define the expected initial and future workload:

- Number of garages at launch.
- Peak simultaneous staff sessions.
- Average and peak check-ins per minute.
- Average and peak check-outs per minute.
- Recharge, refund, and package operations per day.
- Dashboard refresh frequency.
- Expected storage growth and retention period.

### Correctness tests

- [ ] Run simultaneous check-ins for different vehicles in the same garage.
- [ ] Run simultaneous operations on the same vehicle.
- [ ] Run simultaneous balance or recharge requests with distinct and repeated idempotency keys.
- [ ] Run concurrent claim/release session operations.
- [ ] Confirm transactions prevent duplicate events, negative counts, lost updates, and inconsistent balances.
- [ ] Compare final Firestore state with an independently calculated expected state.
- [ ] Confirm retries after timeouts are safe.

### Performance and cost tests

- [ ] Measure p50, p95, and p99 latency for the main workflows.
- [ ] Measure Firestore reads and writes per check-in, check-out, dashboard load, recharge, and rebuild.
- [ ] Confirm dashboard reads use the intended projection path rather than scanning historical events.
- [ ] Estimate monthly Firebase cost at launch volume and at 10x launch volume.
- [ ] Configure a budget alert before increasing traffic.
- [ ] Establish a maximum acceptable latency and error rate for each critical workflow.

**Release blocker:** any test that produces incorrect financial records, duplicate vehicle state transitions, cross-tenant data access, or unrecoverable projection divergence.

## Step 6 — Complete the security and dependency review

**Objective:** Ensure the deployed service protects customer data, privileged operations, credentials, and financial records.

### Application security

- [ ] Review Firestore rules using authenticated owner, admin, delegate, inactive-user, and cross-tenant test identities.
- [ ] Confirm every privileged write is performed through the intended backend authorization path.
- [ ] Confirm tenant identifiers come from authenticated server context rather than trusting client-supplied ownership fields.
- [ ] Confirm rate limits exist for login-sensitive, financial, and mutation endpoints.
- [ ] Confirm request validation rejects malformed IDs, dates, numbers, strings, and idempotency keys.
- [ ] Confirm session claim/release operations remain atomic under concurrency.
- [ ] Confirm CORS, security headers, HTTPS, cookie/session settings, and error responses are appropriate for production.
- [ ] Confirm secrets are absent from Git history, frontend bundles, logs, screenshots, and build artifacts.
- [ ] Review admin PIN/password handling and complete the planned production credential rotation.
- [ ] Remove test accounts, default credentials, and temporary access before launch.

### Dependency review

- [ ] Run `npm audit` from the release commit and save the result.
- [ ] Review the six moderate findings in the Firebase Admin dependency chain.
- [ ] Test the available `firebase-admin` upgrade in a separate branch.
- [ ] Run the complete test suite, build, smoke tests, and backend startup checks after the upgrade.
- [ ] If the upgrade is deferred, record the affected packages, mitigation, owner, deadline, and reason for deferral.
- [ ] Set a recurring dependency review cadence, preferably monthly or after a high-severity advisory.

A moderate dependency finding is not automatically a launch blocker, but a vulnerability involving authentication, authorization, customer data, or remote code execution is a blocker regardless of severity label.

**Pass condition:** security rules and privileged workflows have been tested with negative cases, production secrets are controlled, and every dependency finding has either been fixed or formally accepted with mitigation and a deadline.

## Step 7 — Run a private pilot before public launch

**Objective:** Validate normal daily operations with real users while keeping the blast radius small.

### Pilot design

- [ ] Select one or two trusted garages that can provide rapid feedback.
- [ ] Sign a written pilot agreement that describes pilot status, support channel, data handling, and known limitations.
- [ ] Avoid onboarding more garages than can be actively supported.
- [ ] Schedule daily review of errors, latency, Firebase usage, and customer feedback.
- [ ] Keep a manual fallback procedure for recording vehicle movements and payments during an outage.
- [ ] Do not delete or modify pilot data without an export or documented recovery point.

### Pilot exit criteria

- [ ] Complete at least five consecutive operating days without a Severity 1 incident.
- [ ] Complete at least one representative busy period without data-integrity errors.
- [ ] Confirm all financial operations reconcile with their audit records.
- [ ] Confirm no cross-tenant access or authentication bypass was observed.
- [ ] Confirm backup jobs succeeded during the pilot.
- [ ] Confirm at least one rollback or recovery rehearsal was completed successfully.
- [ ] Resolve or formally accept every pilot defect that affects customer trust.
- [ ] Obtain written approval from the service owner for public launch.

## Recommended 15-business-day timeline

This timeline assumes one person is coordinating the release and that the current automated suite is already green. It can be shortened only when evidence is produced, not by skipping gates.

| Day | Focus | Required output | Gate |
|---|---|---|---|
| 1 | Release inventory | Commit, environments, domains, Firebase project, owners, and open-risk list | No unknown production environment |
| 2 | Clean build and automated gate | `npm ci`, lint, tests, build, `npm run ci:check`, saved logs | Repository gate passed |
| 3 | Vercel and Cloudflare deployment verification | Deployment SHAs, environment-variable inventory, domain/CORS checks | Exact commit deployed |
| 4 | Firebase verification | Rules, indexes, auth settings, billing alerts, test-data separation | Correct Firebase project confirmed |
| 5 | Production smoke test | Completed authentication, garage, vehicle, financial, dashboard, and admin matrix | Critical workflows passed |
| 6 | Backup configuration | Export schedule, retention, access control, failure alert | Backup job succeeds |
| 7 | Recovery drill | Isolated restore, RPO/RTO measurement, recovery runbook | Restore demonstrated |
| 8 | Monitoring and incident response | Alerts, test alert, severity definitions, contacts, incident template | Alert reaches responder |
| 9 | Rollback rehearsal | Vercel rollback, Cloudflare rollback, compatibility check | Rollback completed |
| 10 | Concurrency test | Same-vehicle, different-vehicle, financial retry, session claim/release results | No incorrect state |
| 11 | Cost and capacity review | Read/write measurements, 1x/10x cost estimate, budget thresholds | Cost model accepted |
| 12 | Security review | Rules negative tests, secret review, credential rotation, CORS/rate-limit review | No security blocker |
| 13 | Dependency decision | Upgrade test or documented risk acceptance for the six moderate findings | Owner and deadline recorded |
| 14 | Private pilot start | Pilot users, support path, manual fallback, daily review schedule | Pilot authorized |
| 15 and following 5 operating days | Pilot observation | Daily reports, incidents, user feedback, reconciliation, backup evidence | Public-launch decision |

## Go/no-go meeting

Hold the go/no-go meeting only after the evidence pack is complete. The meeting should answer the following questions directly:

1. Is the exact release commit deployed and verified on Cloudflare and Vercel?
2. Can a garage owner complete the critical workflows without operator intervention?
3. Are vehicle counts, events, balances, revenue, refunds, and projections correct under retry and concurrency?
4. Can the team detect a failure and contact a responsible person quickly?
5. Can the team roll back the application and restore representative data?
6. Are Firebase rules, authentication, CORS, secrets, and privileged operations secure?
7. Has the private pilot completed without unresolved trust-damaging incidents?

Approve public launch only if every answer is **yes** or has a documented, explicitly accepted exception that does not affect data integrity, security, recovery, or core customer operations.

## Launch-day runbook

### Before opening customer access

- [ ] Freeze the release commit and record its SHA.
- [ ] Confirm backups completed recently.
- [ ] Confirm monitoring and alert delivery.
- [ ] Confirm rollback targets are available.
- [ ] Confirm support contact and incident channel are staffed.
- [ ] Confirm test accounts and temporary credentials are removed or disabled.
- [ ] Run `npm run release:smoke` against the production URL.
- [ ] Run one controlled end-to-end test and verify the audit trail.

### During the first operating period

- [ ] Monitor errors, latency, authentication failures, Firebase reads/writes, and budget indicators.
- [ ] Review the first customer transactions manually where appropriate.
- [ ] Reconcile financial and vehicle state at the end of the operating period.
- [ ] Record incidents even if they are resolved immediately.
- [ ] Do not make unreviewed production code or rules changes during the launch window.

### After the first day

- [ ] Review operational metrics and customer reports.
- [ ] Confirm backup completion.
- [ ] Review Firebase cost and usage trends.
- [ ] Confirm no unexpected CORS, cache, service-worker, or authentication behavior.
- [ ] Decide whether to continue expansion, hold the rollout, or roll back.

## Explicit rollback triggers

Roll back or pause onboarding immediately if any of the following occurs:

- Unauthorized access or evidence of cross-tenant data exposure.
- Duplicate or missing financial effects.
- Incorrect vehicle state that cannot be corrected safely from the application.
- Widespread inability to log in, check vehicles in/out, or record payments.
- Failed deployment health check or repeated backend 5xx responses.
- Database rules or indexes cause a critical workflow to fail.
- Backup failure combined with a data-integrity incident.
- Firebase usage or cost increases far beyond the approved model.
- No available person can respond to a serious incident.

## Final approval record

Complete this section before public launch.

| Area | Owner | Evidence link | Status | Sign-off date |
|---|---|---|---|---|
| Deployment verification |  |  |  |  |
| Production smoke tests |  |  |  |  |
| Backup and recovery |  |  |  |  |
| Monitoring and incident response |  |  |  |  |
| Load and concurrency |  |  |  |  |
| Security and dependencies |  |  |  |  |
| Private pilot |  |  |  |  |
| Final service owner approval |  |  |  |  |

**Decision:** `GO` / `GO WITH DOCUMENTED EXCEPTIONS` / `NO-GO`  
**Decision maker:**  
**Date:**  
**Release commit:**  
**Rollback target:**  

## References

[1]: https://firebase.google.com/docs/firestore/backup-restore "Firebase Firestore backup and restore documentation"

[2]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firebase Firestore Security Rules conditions"

[3]: https://vercel.com/docs/deployments "Vercel deployment documentation"

[4]: https://developers.cloudflare.com/pages/ "Cloudflare Pages documentation"

[5]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"
