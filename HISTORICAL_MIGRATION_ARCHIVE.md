# Historical Migration Archive

This file records retired deployment context so old commits and branches are understandable. It is not an active deployment guide.

RQ previously experimented with a Vercel/serverless API arrangement. That work produced generated API bundles, provider routing files, and several migration branches. The production architecture is now:

```text
Cloudflare Pages frontend -> Railway Express backend -> Firebase Authentication/Firestore
```

The active instructions are in [`RAILWAY_DEPLOYMENT_HANDOFF.md`](./RAILWAY_DEPLOYMENT_HANDOFF.md). Do not restore the retired Vercel/serverless artifacts, point the frontend at old Vercel URLs, or resume old migration branches.

The historical commits remain in Git because Git history is append-only. Removing a branch from the GitHub sidebar does not remove the commits already merged into `main`.
