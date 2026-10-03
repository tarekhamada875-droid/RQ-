# Contributing to RQ

## Before changing code

Read `README.md`, `BRANCHING_AND_RELEASES.md`, and `MAINTAINABILITY_HANDOFF.md`. Start from the latest `main` and confirm the working tree is clean:

```bash
git status --short
git pull --ff-only origin main
```

## Branches and pull requests

Create one short-lived branch from `main` for each focused change. Run the local validation gate, push the branch, and open a pull request into `main`. After the PR is merged, delete the remote branch. `main` is the only permanent development and production branch.

A branch shown with GitHub's **Compare & pull request** card is not automatically an open PR. It only means the branch has commits GitHub can compare with `main` and GitHub is offering to create a review request.

## Feature boundaries

Keep business rules in domain modules or focused server route modules. Keep `server/app.ts` focused on application assembly and shared middleware. Keep React screens focused on composition and move reusable behavior into hooks or child components.

Authentication, authorization, session lifecycle, balance operations, vehicle operations, and Firestore writes are sensitive areas. Add or update tests before changing behavior. Preserve response shapes and error codes unless the change explicitly requires a contract migration.

## Cloudflare deployment

The production frontend runs on Cloudflare Pages and the production backend runs on the Cloudflare Worker at `https://rq.tarekhamada875.workers.dev`. Do not add Vercel/serverless routing files or generated provider bundles. Worker deployment is performed by the guarded GitHub Actions workflow:

```bash
npm ci
npm run build:cloudflare
npx wrangler@4.147.0 deploy --config wrangler.deploy.toml --env="" --minify
```

The Cloudflare Pages frontend calls the Worker through `VITE_BACKEND_API_URL` or the safe default in `src/api/apiClient.ts`.

## Validation before review

```bash
npm test
npm run lint
npm run build
npm run maintainability:check
git diff --check
```

For deployment-related changes, also run the live Cloudflare smoke checks documented in `README.md` and `.github/workflows/production-gate.yml`.

## Security rules

Never commit `.env` files, service-account files, private keys, tokens, or real user credentials. Do not add temporary administrative endpoints without an explicit expiry and removal plan. Do not perform destructive Firestore actions without written scope and confirmation.

## Commit guidance

Use a commit message that explains the behavior change. Update `MAINTAINABILITY_HANDOFF.md` after completing a planned structural milestone, including the commit SHA and validation results.
