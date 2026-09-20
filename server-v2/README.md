# RQ server-v2 foundation

This package is the first infrastructure slice from `BACKEND_COMPLETE_OVERHAUL_STAGES.md`. It is intentionally isolated from the production Express entrypoint and frontend, so it cannot change production traffic by being added alone.

The package provides strict TypeScript configuration, typed environment parsing, common response/error contracts, entity schemas, pure domain utilities, bounded repository interfaces, cost-counting test doubles, a non-production health endpoint, and a read-only package catalog endpoint.

Run `npm run lint:v2` and `npm run test:v2` from the repository root. The package catalog endpoint is available only when `NODE_ENV` is not `production`.
