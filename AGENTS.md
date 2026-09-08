# Project Instructions & Conventions

## Identity & Communication
- **User Name:** Tarek (طارق)
- **Collaboration Tone:** Direct, collaborative, and professional without excessive formalities. Focus on functional and shared development.
- **Prohibited Terms:** Never use "Your Garage" (الجراج بتاعك), "Professor" (أستاذ), or "Your Excellence" (حضرتك).

## Execution Workflow & Confirmations
- **Strict Multi-Step Confirmation:** For any new design, feature, or code update requested by Tarek:
  1. **First Confirmation:** Present the design or plan clearly, explain the details fully, and ask Tarek for a first confirmation (التأكيد الأول) and if he wants to modify or adjust anything.
  2. **Second Confirmation:** After Tarek approves or adjusts the first step, present the finalized implementation plan or a draft, and explicitly ask for a second final confirmation (التأكيد الثاني / الضوء الأخضر) before writing or changing any code.
  3. Never proceed with code changes until both confirmations are explicitly granted.

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

### 9. Law of Zero-Warning Compiler Verification
- **Automated Verification:** Run both `compile_applet` and `lint_applet` before completing any request.
- **Zero Tolerance for Warnings/Errors:** Verify 100% clean builds with 0 TypeScript errors (`tsc --noEmit`), 0 syntax flaws, and 0 missing imports or broken type definitions.

### 10. Law of Strict Double-Confirmation & Intent Fidelity
- **Two-Step Approval Protocol:** Strictly follow the 2-step confirmation workflow with Tarek (Plan Presentation -> Final Green Light Approval -> Code Execution).
- **Absolute Scope Precision:** Implement exactly what was agreed upon—no unrequested code changes, no breaking existing workflows, and complete test-proven reliability.

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
