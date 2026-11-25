/**
 * incomeExport — print & CSV export for the admin Income page (الدخل),
 * owner-approved step 2 of the income plan (2026-11-23).
 *
 * Read economy (docs/PROJECT.md): exporting re-walks the existing paged
 * history door (GET /api/admin/income/history), so the cost is exactly
 * 1 read per ledger row (+ legacy garage-name lookups) and it only burns
 * coins when the owner actually presses a button. Nothing here is polled
 * or prefetched. Pages of 100 are a transport detail only (server clamps
 * at MAX_FIRESTORE_PAGE_SIZE = 100) — per-row coin cost is unchanged, we
 * just halve the number of round trips.
 *
 * INCOME_EXPORT_MAX_ROWS is a runaway guard: a 20-year ledger can never
 * silently walk into millions of rows. If the cap bites, the CSV/statement
 * says so clearly (honest records — never a silently partial tax file).
 */
import type { AdminIncomeRow } from '../services/adminIncomeService';
import { safeDate } from './dates';

export const INCOME_EXPORT_MAX_ROWS = 5000;
export const INCOME_EXPORT_PAGE_SIZE = 100;

const CAIRO_TZ = 'Africa/Cairo';

/** One source of truth for income source labels (UI chips, CSV, print). */
export const incomeSourceLabel = (source: string | undefined): string => {
  if (source === 'credit_request_approval') return 'طلب مندوب';
  if (source === 'admin_entered_grant') return 'إضافة يدوية';
  return 'شحن رصيد';
};

const roundMoney2 = (value: number): number => Math.round(value * 100) / 100;

const arabicNumber = (value: number): string => roundMoney2(value).toLocaleString('ar-EG');

/** Excel-friendly timestamp: Latin digits, Cairo timezone, sortable-ish. */
const formatCsvTimestamp = (timestamp: unknown): string => {
  const date = safeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

/** Stable ASCII filename date (YYYY-MM-DD) pinned to Cairo. */
const formatFileDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const incomeCsvFilename = (generatedAt: Date): string =>
  `سجل-الدخل-${formatFileDate(generatedAt)}.csv`;

const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
};

/**
 * Full money-in CSV (UTF-8 BOM so Excel opens Arabic correctly, CRLF rows,
 * every cell quoted). Plain numbers — no Arabic digits — so the file stays
 * sortable and filterable in Excel.
 */
export const buildIncomeCsv = (rows: AdminIncomeRow[]): string => {
  const headers = ['التاريخ', 'الجراج', 'المبلغ (ج.م)', 'الرصيد المضاف', 'المصدر', 'البيان'];
  const lines = rows.map((row) => [
    formatCsvTimestamp(row.occurredAt),
    row.garageName || 'جراج',
    String(roundMoney2(Number(row.paymentAmountEgp ?? 0))),
    String(roundMoney2(Number(row.amount ?? 0))),
    incomeSourceLabel(row.source),
    row.reason || '',
  ].map(escapeCsvCell).join(','));
  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...lines].join('\r\n');
};

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const statementTimestamp = (timestamp: unknown): string => {
  const date = safeDate(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: CAIRO_TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

interface IncomeStatementInput {
  rows: AdminIncomeRow[];
  /** The O(1) notebook total from /api/admin/income/summary. */
  lifetimeTotalEgp: number;
  generatedAt: Date;
  /** True when the runaway cap cut the walk short — must be disclosed. */
  truncated: boolean;
}

/**
 * Self-contained RTL Arabic printable statement (money-in records).
 * Rendered into a hidden iframe and printed via the browser print dialog
 * (save as PDF) — no external libs, prints in black & white, table header
 * repeats across pages.
 */
export const buildIncomeStatementHtml = ({ rows, lifetimeTotalEgp, generatedAt, truncated }: IncomeStatementInput): string => {
  const listedSumEgp = rows.reduce((sum, row) => sum + Number(row.paymentAmountEgp ?? 0), 0);
  const newest = rows.length ? statementTimestamp(rows[0].occurredAt) : null;
  const oldest = rows.length ? statementTimestamp(rows[rows.length - 1].occurredAt) : null;

  const bodyRows = rows.length
    ? rows.map((row) => {
        const garage = escapeHtml(row.garageName || 'جراج');
        const reason = row.reason ? escapeHtml(row.reason) : '—';
        const source = escapeHtml(incomeSourceLabel(row.source));
        return `<tr>
  <td class="num">${statementTimestamp(row.occurredAt)}</td>
  <td>${garage}</td>
  <td class="num">${arabicNumber(Number(row.paymentAmountEgp ?? 0))}</td>
  <td class="num">${arabicNumber(Number(row.amount ?? 0))}</td>
  <td>${source}</td>
  <td>${reason}</td>
</tr>`;
      }).join('\n')
    : '<tr><td colspan="6" style="text-align:center;">لا يوجد دخل مسجل.</td></tr>';

  const warning = truncated
    ? `<div class="warn">تنبيه: السجل أطول من حد التصدير (${INCOME_EXPORT_MAX_ROWS} عملية) — هذا الكشف يشمل أول ${INCOME_EXPORT_MAX_ROWS} عملية فقط من الأحدث للأقدم.</div>`
    : '';

  const period = newest && oldest ? `<div>الفترة: من ${oldest} إلى ${newest}</div>` : '';

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>كشف دخل — نظام RQ</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Tahoma, Arial, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
  .meta { border: 1px solid #999; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; }
  .meta .total { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .warn { border: 1px solid #b91c1c; color: #b91c1c; padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: right; vertical-align: top; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; }
  .foot { margin-top: 16px; color: #555; font-size: 11px; }
  @page { size: A4; margin: 12mm; }
</style>
</head>
<body>
  <h1>كشف دخل — نظام RQ</h1>
  <div class="sub">اتولّد آليًا بتاريخ ${statementTimestamp(generatedAt)}</div>
  ${warning}
  <div class="meta">
    <div class="total">إجمالي الدخل الكلي: ${arabicNumber(lifetimeTotalEgp)} ج.م</div>
    <div>إجمالي العمليات المدرجة: ${arabicNumber(listedSumEgp)} ج.م</div>
    <div>عدد العمليات المدرجة: ${arabicNumber(rows.length)}</div>
    ${period}
  </div>
  <table>
    <thead>
      <tr><th>التاريخ</th><th>الجراج</th><th>المبلغ (ج.م)</th><th>الرصيد المضاف</th><th>المصدر</th><th>البيان</th></tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    <tfoot>
      <tr><td colspan="2">الإجمالي (العمليات المدرجة)</td><td class="num">${arabicNumber(listedSumEgp)}</td><td colspan="3"></td></tr>
    </tfoot>
  </table>
  <div class="foot">الكشف بيمثل المقبوضات المسجلة داخل نظام RQ مقابل شحن رصيد الجراجات فقط، ولا يشمل أي مصاريف خارج النظام.</div>
</body>
</html>`;
};

interface IncomePage {
  rows: AdminIncomeRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Walks the paged history door until it runs dry or the runaway cap bites.
 * The fetcher is injected so tests stay pure and the coin cost stays
 * exactly the door's own cost (1 read per row).
 */
export const fetchAllIncomeRows = async (
  fetchPage: (cursor: string | null) => Promise<IncomePage>,
  // Injectable for tests; production always walks with the full cap.
  maxRows: number = INCOME_EXPORT_MAX_ROWS
): Promise<{ rows: AdminIncomeRow[]; truncated: boolean }> => {
  const rows: AdminIncomeRow[] = [];
  let cursor: string | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchPage(cursor);
    const incoming = page.rows || [];
    const room = maxRows - rows.length;
    if (incoming.length > room) {
      rows.push(...incoming.slice(0, room));
      return { rows, truncated: true };
    }
    rows.push(...incoming);
    if (!page.hasMore || !page.nextCursor) return { rows, truncated: false };
    if (rows.length >= INCOME_EXPORT_MAX_ROWS) return { rows, truncated: true };
    cursor = page.nextCursor;
  }
};

/** Same download pattern as GarageDailyReportModal (Blob + temp link). */
export const downloadIncomeCsv = (csv: string, filename: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a beat to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Print via a hidden iframe (no popup-blocker risk, works inside the PWA
 * webview). The iframe is kept alive for a minute after printing — removing
 * it too early can cancel an open print preview on some browsers.
 */
export const printHtmlDocument = (html: string): void => {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = '';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 60_000);
    }
  };
  document.body.appendChild(iframe);
};
