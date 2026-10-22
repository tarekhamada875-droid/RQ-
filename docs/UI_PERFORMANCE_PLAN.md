# UI Performance and Maintainability Plan

## Purpose

Improve measured browser performance and code maintainability without redesigning the product. Preserve the current visual design, Arabic/English behavior, Egyptian license-plate identity, RTL/LTR layout, responsive behavior, and role flows.

This is the only active product-improvement plan in this document. Legacy-data cleanup and the Reliability and Scale workstream are not included. Do not restart either skipped workstream from this plan.

## Lean execution sequence

### 1. Prove the measurement setup on one screen

Start with the garage dashboard and the existing authenticated synthetic fixture workflow. First verify that the real login path reaches the expected fixture reliably and that repeated captures produce comparable results. Use emulator data only; do not profile production users or records.

Capture only decision-relevant signals: initial render/load time, latency for one representative interaction, network requests, and active listeners. Record the browser, viewport, fixture role, and run conditions so a repeat can be compared. Begin with mobile and desktop for this one screen; expand the matrix only if the measurements are reliable and the suspected issue warrants it.

An earlier pre-fix baseline attempt was stopped and reverted because garage login was unreliable. It is superseded by the successful authenticated baseline recorded below; do not treat the earlier attempt as valid evidence. Existing role smoke coverage is useful for fixture verification, but a successful smoke capture alone is not performance evidence.

### 2. Decide whether optimization is justified

Compare repeated runs and distinguish application behavior from emulator, network, or browser noise. Rank only bottlenecks that are both reproducible and meaningful to the user. Do not create an optimization task if no such bottleneck is demonstrated; record the result briefly and stop.

Do not collect a full multi-screen, multi-theme, multi-language baseline matrix by default. Add another screen, role, viewport, or metric only when evidence suggests the bottleneck crosses that boundary or the next change could affect it.

### 3. Make one evidence-led change

Select one bounded change for the single worst demonstrated bottleneck. Examples include lazy-loading a rarely opened modal, eliminating duplicated requests or listeners, reducing unnecessary derived-list work, or virtualizing a genuinely long list. Do not optimize from source-file size, intuition, or generalized preference alone.

Add focused regression coverage before changing behavior. Preserve authorization, server authority, pagination, financial behavior, accessibility, and bilingual/RTL/LTR behavior. No redesign, framework migration, broad rewrite, or speculative memoization.

### 4. Compare and decide whether to continue

Repeat the same fixture, browser, viewport, and measurements. Review before/after behavior and performance. Keep the change only if the improvement is reproducible and no protected behavior regresses. If the result is neutral, noisy, or negative, stop or revert rather than expanding the scope.

Start another optimization only when the previous change is merged and its measured result is recorded. Expand measurement coverage only when the evidence or a change's impact requires it.

## Delivery safeguards

- Use synthetic emulator fixtures; never use production customer data for profiling.
- Keep every change focused, with a regression test where applicable.
- Run relevant tests plus `npm test`, `npm run test:rules`, `npm run lint`, `npm run build`, `npm run ci:check`, `npm run maintainability:check`, and `git diff --check`.
- Use one focused branch and pull request per bounded implementation change; wait for the required Production Gate before merging.
- Do not deploy or alter production data as part of this program.
- Stop when measurement is unreliable or no meaningful bottleneck is established; fix the measurement setup only if the owner still wants the investigation.

## Current execution status — 2026-10-22

The first task is complete: the authenticated garage fixture passed twice on mobile and twice on desktop, including the active Firestore listener count. The repeated runs showed seven active Firestore subscription registrations with the same inventory at both viewports and no duplicate registrations. The method, full listener inventory, timing ranges, and limitations are recorded in `docs/testing/UI-OPT-01-GARAGE-BASELINE-2026-10-21.md`.

**Decision after step 2:** these synthetic local measurements do not demonstrate a meaningful, reproducible user-facing bottleneck. Do not start an optimization task; stop here. Resume only if the owner identifies a concrete performance symptom that warrants targeted measurement or explicitly approves a production-like test environment.
