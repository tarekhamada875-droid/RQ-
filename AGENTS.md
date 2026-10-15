# Project Instructions & Conventions

## Identity & Communication
- **User Name:** Tarek (طارق)
- **Collaboration Tone:** Direct, collaborative, and professional without excessive formalities. Focus on functional and shared development.
- **Prohibited Terms:** Never use "Your Garage" (الجراج بتاعك), "Professor" (أستاذ), or "Your Excellence" (حضرتك).

## Owner-centered collaboration
- Read [`PROJECT_WORKING_AGREEMENT.md`](PROJECT_WORKING_AGREEMENT.md) before substantial work. Tarek is the product visionary, not a technical specialist; explain results and risks in everyday language and do not make him choose routine engineering details.
- For every completed roadmap item, state the problem, what changed, a concrete user-facing example, why it helps, what was actually measured/tested, and whether it is local, in a PR, merged, or live. Use the owner's practical analogy style; never claim unmeasured 10x/50x gains.
- The owner authorized autonomous implementation of the approved [`RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md`](RQ_PROJECT_JARVIS_MODERNIZATION_PLAN_2026-10-14.md) roadmap. Make routine reversible engineering decisions, test them, and use the repository release flow. Ask only for a material product/business choice or before an important irreversible action outside the approved scope. Protect data and credentials regardless of broad engineering authority.
- Persist new decisions, verified status, and remaining work in the tracked project documents; do not rely on private chat memory being available to the next contributor.

## Current environment status
- **Controlled production path:** The active deployment is Cloudflare Pages → Cloudflare Worker → Firebase. Railway deployment configuration and active service references are retired. The owner last confirmed on 2026-10-14 that the project has no real users, customer records, or live financial data; use synthetic data only and re-confirm before relying on that status for future tasks.
- **Required boundary:** Do not treat synthetic pre-production as permission to touch unknown data, perform destructive cleanup, import customer data, accept real revenue, or claim final production readiness. Revisit separate staging before any of those conditions change.

## Active release flow — reconciled 2026-10-13
- Develop each focused change on a short-lived branch from the latest `main`; run the project checks and open a pull request to `main`.
- `main` is the production source of truth. Merging/pushing to `main` publishes the Pages front end and starts the guarded Worker deployment workflow after its verification job succeeds.
- Branch previews and the old `rq-hono-preview` Worker are not active test environments. Do not create or re-enable preview deployments; use local/unit/emulator tests unless a separately authorized test environment is established.
- Do not deploy a Worker manually or change Firebase data/rules as a shortcut around the release gates. Keep synthetic fixtures separate from any future real-user data.

## Former Hono migration — closed
- Hono is the production Worker backend; the owner-authorized cleanup that removed the remaining Express runtime was completed in PR #32 and deployed. Do not reintroduce Express or restart the retired migration workstream.
- The former `migration/unified-hono` branch and its preview/rehearsal workflow are retired. Do not recreate them as current development or test environments.
- Follow the normal branch-and-PR release flow above for current work. Keep credentials protected, validate focused changes, preserve rollback options, and obtain explicit authorization for destructive production-data operations.

## Design Conventions
- **License Plate UI:** The primary input field is designed as a realistic Egyptian license plate. Maintain this visual identity in future updates.
- **Performance:** Prioritize CSS-based styling and light DOM structures to ensure maximum speed and compatibility.

---

## 🛡️ Top 10 Super Coder Laws (Zero-Bug & Perfect Execution Principles)

### 1. Law of Null & Undefined Defense (Guard Clauses)
- **Assume Nothing, Check Everything:** Every external payload (Firestore documents, API responses, localStorage data, component props) MUST be treated as potentially null, undefined, or incomplete.
- **Optional Chaining & Nullish Fallbacks:** Always use `?.` and `??` (or `|| default`) before accessing nested properties or executing methods (e.g. `garage?.balanceExpiry`, `(items || []).map()`).

### 2. Law of Date & Timestamp Normalization (`safeDate`)
- **Single Source of Truth for Dates:** NEVER call `.toDate()`, `.getTime()`, `.toISOString()`, or `.toLocaleDateString()` directly on unvalidated raw objects.
- **Mandatory Wrapper:** Always pass dates or Firestore timestamps through `safeDate()` (or `safeDate(val).getTime()`) to handle JS `Date`, Firestore `Timestamp`, ISO strings, numbers, or `null`/`undefined` gracefully without throwing runtime crashes.

### 3. Law of Static Import & Identifier Integrity
- **Mandatory Top-Level Import Audit:** Whenever referencing helper utilities (`safeDate`, `normalizeDigits`, `formatCurrency`, `getCleanPlate`), icons (`lucide-react`), components, or types, verify they are explicitly imported at the top of the file.
- **Zero Unresolved Identifiers:** Never rely on implicit globals or assume a utility is present without verifying its import line.

### 4. Law of Dynamic Business Logic & Hardcoding Prohibition
- **Dynamic Package & Subscription Handling:** Never hardcode package checks to a limited subset (e.g. only `'weekly_sub'` and `'monthly_sub'`). Always support all package types including `'biweekly_sub'`, 15-day packages, custom packages, or fallback dynamically to `pkg.vehiclesCount` / `carsCount` / `balanceDays`.
- **Flexible Expiry Logic:** Calculate subscription end dates dynamically based on actual package days added onto either current expiry (if in the future) or current time.

### 5. Law of Input Hygiene & Numeric Sanitization
- **Strict Numeric Fields:** All numeric input fields must use `type="text" inputMode="numeric" pattern="[0-9]*"` with `.replace(/\D/g, '')` in `onChange` to prevent `NaN`, browser spin artifacts, or forced direction issues.
- **Arabic/English Digit Normalization:** Ensure user inputs pass through `normalizeDigits()` where appropriate and keep typography & currency badges (`ج.م`) cleanly aligned (`font-mono`).

### 6. Law of Atomic Firestore Transactions & Consistency
- **Concurrency Protection:** Multi-document updates (e.g. package recharge, subscriber renewal, delegate balance settlement) MUST use atomic Firestore transactions (`runTransaction`) or batch operations (`writeBatch`) with pre-read verification to prevent race conditions, duplicate charges, or partial document corruption.

### 7. Law of Clean State & Memory Leak Prevention
- **Functional State Updates:** Use functional state updates (`setItems(prev => ...)`) to prevent stale closure bugs in async operations.
- **Subscription Cleanup:** Always unsubscribe from Firestore real-time listeners (`onSnapshot`) in `useEffect` cleanup return functions to prevent memory leaks and state updates on unmounted components.

### 8. Law of Fail-Safe UI & Error Boundaries
- **Graceful Degraded States:** Every view and component must render clean loading, empty, and fallback UI states without breaking the page layout when data is missing or fetching fails.
- **Non-Blocking Error Handling:** Wrap async handlers in `try/catch` blocks and log errors gracefully or display localized toast notifications instead of crashing the React component tree.

### 9. Law of Repository-Native Verification
- **Use real project commands:** Run the repository's current verification gate, `npm run ci:check`, and `npm run maintainability:check` for source changes; consult `package.json` and the release workflow if scripts change. Do not invent commands from another platform.
- **Report accurately:** Fix failed checks within scope. Distinguish blocking errors from non-blocking tool warnings and state exactly what passed; do not promise a warning-free external toolchain when the repository does not control it.

### 10. Law of Owner Intent & Sensible Autonomy
- **No routine approval loop:** When the request and existing owner authorization make the goal clear, carry the work through implementation, tests, review, and the established PR/release process. Do not ask the owner to approve routine implementation details or repeat an authorization already given.
- **Pause for consequential choices:** Ask only when uncertainty could materially change product/business behavior or before important irreversible actions such as destructive data operations. Keep changes focused, preserve existing behavior unless a change is requested, and describe residual risk honestly.

---

## 🎨 Top 10 Specialized Front-End Engineering Laws

### 1. Law of Effect Hygiene & Infinite Loop Defense
- **Primitive Dependency Arrays:** Never pass unmemoized inline objects, fresh arrays, or unmemoized functions into `useEffect` or `useMemo` dependency arrays.
- **State Update Restrictions:** Never trigger direct state setters inside the synchronous body of a rendering component without conditional guards.

### 2. Law of Event Listener & Timer Unmount Cleanup
- **Leak-Free Effects:** Every `useEffect` that sets up a DOM event listener (`window.addEventListener`), timer (`setInterval`, `setTimeout`), or stream observer MUST return an explicit cleanup function to unbind listeners on unmount.

### 3. Law of Touch Target & Fluid Layout Accessibility
- **Mobile Touch Comfort:** All interactive elements (buttons, icons, tabs, inputs) MUST have a minimum touch target area of 44x44px on mobile viewports.
- **Fluid Container Limits:** Container widths must use responsive fluid bounds (`w-full max-w-7xl mx-auto`) with proper padding to prevent awkward stretching on ultra-wide displays or clipping on mobile screens.

### 4. Law of Interactive Feedback & State Visuals
- **Explicit User Feedback:** Every button and interactive control MUST feature clear hover, active, focus-visible, and disabled states (`disabled:opacity-50 disabled:cursor-not-allowed`).
- **Loading Spinners on Action:** Submit buttons must display inline loading indicators during active async submissions and prevent accidental double-clicks.

### 5. Law of Skeleton Loaders & Optimistic UI Updates
- **No Content Layout Shift (CLS):** Never leave screens as blank white blocks during initial data fetching. Use structured skeleton loaders matching the exact visual footprint of incoming cards and tables.
- **Optimistic State Feedback:** Immediately update local UI state for instant visual feedback, while gracefully rolling back if backend sync fails.

### 6. Law of Typography Alignment & RTL/LTR Formatting
- **Data & Numeric Monospace:** Numbers, currencies (`ج.م`), vehicle counters, serial codes, and license plate characters MUST use monospace fonts (`font-mono`) to prevent alignment jitter during dynamic updates.
- **Text Wrapping & Overflow:** Prevent text clipping or awkward hyphenation in badges, pills, and buttons using `whitespace-nowrap` and `truncate` where appropriate.

### 7. Law of Single Responsibility & Modularity
- **Component File Limits:** Keep component files focused and concise (under ~350 lines). Complex modals, dense dashboard widgets, or specialized business hooks MUST be modularized into dedicated `/src/components/` files.

### 8. Law of Form Resiliency & Non-Destructive Inputs
- **Prevent Unintentional Loss:** Forms must preserve user input upon validation errors without resetting fields.
- **Native Keyboard Support:** Ensure form inputs respond gracefully to `Enter` key presses (`onSubmit`) and maintain logical `tabIndex` sequences.

### 9. Law of Asset Fallbacks & Image Error Guards
- **Resilient Image Elements:** Every `<img>` tag or avatar element MUST include an `onError` fallback handler or display a styled icon placeholder if image source URLs fail to load.

### 10. Law of Hardware-Accelerated Micro-Interactions
- **Smooth 60fps Motion:** Use hardware-accelerated Tailwind transitions (`transition-all duration-200 ease-in-out`) or `motion/react` for modals and dropdowns. Avoid animating heavy properties like `width`, `height`, or `top` directly; prefer `transform` (`scale`, `translate`) and `opacity`.
