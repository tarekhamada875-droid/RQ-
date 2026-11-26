/**
 * money — the single home for number display formatting.
 *
 * Audit F-18 (Phase 4b, 2026-11-26): the app previously had ~30 inline
 * `toLocaleString` calls with THREE disagreeing locales:
 *   - `en-US` (Latin digits, "1,000") — commission heroes, requests, credit grants
 *   - `ar-EG` (Arabic-Indic digits, "١٬٠٠٠") — income view, rate previews
 *   - **bare** (`toLocaleString()`) — one call that rendered differently
 *     depending on each admin's BROWSER locale.
 *
 * So the same EGP amount could render as "1,000" on one admin screen and
 * "١٬٠٠٠" on another. This module is the one home; every display-number call
 * routes through it so the formats can never drift again.
 *
 * Canonical formats (per the codebase's own documented convention —
 * utils/plates.ts: "The data layer (Firestore, Worker API, PINs, phones,
 * money) stays Western" — and the workflow audit's bilingual contract:
 * numeric fields are intentionally LTR):
 *
 *   - `formatNumberEn` — admin/delegate-facing numbers (money ج.م and credits
 *     رصيد alike). Latin digits with grouping separators: 1,000.
 *   - `formatNumberAr` — garage-facing Arabic-Indic numbers: ١٬٠٠٠. Used where
 *     the audience is the garage owner/staff and the number sits inside
 *     Arabic prose.
 *
 * Both guards accept null/undefined/NaN and render '0' — callers previously
 * hand-rolled `(x ?? 0)` and `|| 0` in half the call sites; the other half
 * would render "NaN" on bad data. One guard here covers everyone.
 */

const safeNumber = (value: number | null | undefined): number =>
  (typeof value === 'number' && Number.isFinite(value)) ? value : 0;

/**
 * Canonical admin/delegate-facing number format: Latin digits with grouping
 * ("1,000"). Used for EGP money (ج.م) and credits (رصيد) displays on admin
 * and delegate screens.
 *
 * @param value the number to format (null/undefined/NaN → '0')
 * @param opts optional Intl options passthrough (e.g. maximumFractionDigits)
 */
export function formatNumberEn(
  value: number | null | undefined,
  opts?: Intl.NumberFormatOptions,
): string {
  return safeNumber(value).toLocaleString('en-US', opts);
}

/**
 * Canonical garage-facing number format: Arabic-Indic digits with the Arabic
 * thousands separator ("١٬٠٠٠"). Used where the audience is the garage
 * owner/staff or the number sits inside Arabic prose.
 *
 * @param value the number to format (null/undefined/NaN → '٠')
 */
export function formatNumberAr(value: number | null | undefined): string {
  return safeNumber(value).toLocaleString('ar-EG');
}
