# 🏁 Production Architecture & Security Guide (Firebase Free Spark Tier)

## 📡 1. Server-Authoritative Architecture (Express + Firebase Admin SDK)
- **Spark Tier Server Authority**: The entire application runs on the Express server integrated with Vite and the Firebase Admin SDK on the Firebase Free Spark Plan, without requiring billed Cloud Functions.
- **Server-Authoritative Authentication & Validation**: Critical security actions, PIN verifications, active session locks, check-in, check-out, plate deletions, and package recharges execute exclusively via server API endpoints (`/api/transactions/*`, `/api/auth/*`).
- **Financial Mutability Guard**: Sensitive financial fields (`balance`, `balanceExpiry`, `totalAdminRevenue`, `lastRechargeAmount`) are read-only for client SDKs and can only be modified through authenticated server transactions.

## 💾 2. Read Budget Optimization & UI Throttling
- **Snapshot Stream Throttling**: Real-time snapshot streams utilize `throttleSnapshot` controls to prevent excessive UI re-renders and reduce Firestore read thrashing on busy garage terminals.
- **Efficient Document Querying**: Real-time listeners target isolated documents and collections without blanket table scans.

## 🔒 3. Concurrency Protection & Race Condition Locks
- **Atomic Transactions**: Sensitive multi-document writes (check-in, check-out, balance settlement, recharge approval, session locking) are executed within atomic Admin SDK Firestore transactions (`adminDb.runTransaction`).
- **Network Re-entry Defense**: Handlers perform pre-read verification to reject double-clicks and concurrency collisions.
- **Comprehensive Firestore Security Rules**: Granular role-based security rules enforcing strict write access boundaries on `/garages/{garageId}`, `/vehicles`, `/subscribers`, `/daily_stats`, and session documents.

## 🎨 4. Responsive & Typographic Stabilization
- **Viewport Height Containment**: Replaced static font sizing in `LandscapeMobileView.tsx` with responsive viewport units (`vh` bounds) to contain dynamic overflows safely across handheld displays.
- **Hardware-Accelerated Layer Isolation**: Forced GPU composition (`transform: translateZ(0)`, `will-change`) across high-frequency animation elements in `index.css`.
- **Safe Monogram Extraction**: Monogram characters processed safely via `resolveMonogram` in `StaffStatsModal.tsx` to handle multi-lingual Arabic strings without visual anomalies.

## 5. Cloud Run Implementation Foundation

The repository now includes a deployable Node 22 container in `Dockerfile`, a matching `.dockerignore`, and `cloudbuild.yaml`. The image listens on Cloud Run's `PORT` value, defaults to port `8080`, binds to `0.0.0.0`, serves the Vite build, and exposes the same server-authoritative API. The Cloud Build pipeline publishes an immutable image to Artifact Registry and deploys a new Cloud Run revision.

`CLOUD_RUN.md` contains the one-time Google Cloud setup, Secret Manager guidance, Vercel cutover procedure, smoke checks, and rollback commands. Secrets must be supplied through Cloud Run environment variables or Secret Manager. Service-account JSON, private keys, and `.env` files must never be committed.

Before traffic is moved, run `npm run lint`, `npm run test`, and `npm run build`. After deployment, verify `/api/health`, the root document, Firebase authentication, an authenticated read, CORS from the intended Vercel origin, session expiry handling, and a non-destructive authenticated request. Keep the existing Vercel deployment available as the frontend and rollback path until the Cloud Run revision passes these checks.
