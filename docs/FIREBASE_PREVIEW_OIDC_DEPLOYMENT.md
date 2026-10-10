# Isolated Firebase Preview Deployment Identity

This deploy path manages only Firestore Rules and composite indexes for `rq-hono-preview-isolated`. It does not deploy application code, read/write Firestore documents, or target production.

## GitHub workflow

Workflow: `.github/workflows/firebase-preview-firestore.yml`

- Runs on manual dispatch or changes to `firebase.json`, `firestore.rules`, or `firestore.indexes.json` on `migration/unified-hono`.
- Requests a short-lived Google credential using GitHub OIDC; no service-account JSON key is stored.
- Explicitly targets project `rq-hono-preview-isolated` and only `firestore:rules,firestore:indexes`.
- Uses GitHub environment `firebase-preview-deploy`.

Before using it, configure these two variables on that GitHub environment:

- `FIREBASE_PREVIEW_WIF_PROVIDER`: full resource name of the Workload Identity Provider.
- `FIREBASE_PREVIEW_DEPLOYER_SERVICE_ACCOUNT`: email of the dedicated deploy-only service account.

## Isolated Google Cloud setup required

Create a dedicated service account in `rq-hono-preview-isolated`, for example `firebase-preview-deployer`. Do **not** reuse the runtime Worker account and do not create/download a JSON key.

Grant only these project roles to this deployment identity:

- `roles/firebaserules.admin` — manage Firebase Security Rules releases/rulesets.
- `roles/datastore.indexAdmin` — manage Firestore index definitions/schemas.
- `roles/serviceusage.serviceUsageConsumer` — use the target project’s enabled APIs during CLI deployment.

These deployment roles are separate from the preview Worker’s `roles/datastore.user`; they do not grant Firestore document read/write access. Do not grant `Owner`, `Editor`, `Firebase Admin`, `Cloud Datastore Admin`, or production-project permissions.

Configure Workload Identity Federation for GitHub Actions and bind the service account’s `roles/iam.workloadIdentityUser` grant to a principal set scoped to repository `tarekhamada875-droid/RQ-`. The provider condition must further restrict access to this exact ref and workflow:

```text
assertion.repository == 'tarekhamada875-droid/RQ-' &&
assertion.ref == 'refs/heads/migration/unified-hono' &&
assertion.workflow_ref == 'tarekhamada875-droid/RQ-/.github/workflows/firebase-preview-firestore.yml@refs/heads/migration/unified-hono'
```

Set the `google-github-actions/auth` provider resource variable to the resulting provider’s full name and the deployer-account variable to its service-account email. The project number is needed when constructing the provider resource and principal-set member. Verify the resource names and IAM bindings before storing them in GitHub environment variables.

## Safe execution

1. Validate the exact Firebase rules and indexes in the migration branch and pass the repository’s emulator/CI checks.
2. Dispatch this workflow against `migration/unified-hono` and verify the logs show only the target `rq-hono-preview-isolated` and only Firestore Rules/index targets.
3. Verify in Firebase Console that the repository Rules were published and all eight repository composite indexes are present/ready.
4. Only then proceed to isolated synthetic-only authenticated route tests. No production operation is in scope.

`firebase.json` and `.firebaserc` must not be treated as target guards by themselves; `.firebaserc` defaults to production, so the explicit `--project rq-hono-preview-isolated` argument in the workflow is mandatory.
