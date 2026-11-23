import { describe, expect, it } from 'vitest';
import {
  INCOME_EXPORT_MAX_ROWS,
  buildIncomeCsv,
  buildIncomeStatementHtml,
  fetchAllIncomeRows,
  incomeCsvFilename,
  incomeSourceLabel
} from './incomeExport';
import type { AdminIncomeRow } from '../services/adminIncomeService';

const row = (overrides: Partial<AdminIncomeRow> = {}): AdminIncomeRow => ({
  id: 'r1',
  garageId: 'g1',
  garageName: 'جراج النور',
  amount: 100,
  paymentAmountEgp: 1000,
  balanceAfter: 160,
  occurredAt: '2026-11-20T10:00:00.000Z',
  reason: 'دفعة نقدية',
  source: 'admin_entered_grant',
  ...overrides,
});

describe('incomeSourceLabel', () => {
  it('maps every known source to its Arabic label', () => {
    expect(incomeSourceLabel('credit_request_approval')).toBe('طلب مندوب');
    expect(incomeSourceLabel('admin_entered_grant')).toBe('إضافة يدوية');
    expect(incomeSourceLabel(undefined)).toBe('شحن رصيد');
    expect(incomeSourceLabel('something_new')).toBe('شحن رصيد');
  });
});

describe('buildIncomeCsv', () => {
  it('starts with a UTF-8 BOM and Arabic headers', () => {
    const csv = buildIncomeCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('"التاريخ","الجراج","المبلغ (ج.م)","الرصيد المضاف","المصدر","البيان"');
  });

  it('writes plain Excel-friendly numbers, not Arabic digits', () => {
    const csv = buildIncomeCsv([row({ paymentAmountEgp: 1234.5, amount: 100 })]);
    expect(csv).toContain('"1234.5"');
    expect(csv).toContain('"100"');
  });

  it('escapes quotes and commas in free-text cells', () => {
    const csv = buildIncomeCsv([row({ reason: 'دفع "نقدي", كامل' })]);
    expect(csv).toContain('"دفع ""نقدي"", كامل"');
  });

  it('uses CRLF line endings and one line per row plus header', () => {
    const csv = buildIncomeCsv([row({ id: 'r1' }), row({ id: 'r2' })]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
  });

  it('falls back to جراج when the legacy row has no stamped name', () => {
    const csv = buildIncomeCsv([row({ garageName: '' })]);
    expect(csv).toContain('"جراج"');
  });
});

describe('incomeCsvFilename', () => {
  it('is Arabic, dated, and has the csv extension', () => {
    const name = incomeCsvFilename(new Date('2026-11-23T09:30:00.000Z'));
    expect(name).toMatch(/^سجل-الدخل-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(name).toContain('2026-11-23');
  });
});

describe('fetchAllIncomeRows', () => {
  it('walks pages with the returned cursor and stops at the last page', async () => {
    const cursors: (string | null)[] = [];
    const fetchPage = async (cursor: string | null) => {
      cursors.push(cursor);
      if (cursor === null) {
        return { rows: [row({ id: 'r1' })], hasMore: true, nextCursor: 'CUR1' };
      }
      return { rows: [row({ id: 'r2' })], hasMore: false, nextCursor: null };
    };

    const { rows, truncated } = await fetchAllIncomeRows(fetchPage);
    expect(cursors).toEqual([null, 'CUR1']);
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(truncated).toBe(false);
  });

  it('stops when the server says more but offers no cursor', async () => {
    const fetchPage = async () => ({ rows: [row()], hasMore: true, nextCursor: null });
    const { rows, truncated } = await fetchAllIncomeRows(fetchPage);
    expect(rows).toHaveLength(1);
    expect(truncated).toBe(false);
  });

  it('truncates mid-page when the runaway cap is reached', async () => {
    const smallFetch = async (cursor: string | null) => {
      if (cursor === null) return { rows: [row({ id: 'r1' }), row({ id: 'r2' })], hasMore: true, nextCursor: 'CUR1' };
      return { rows: [row({ id: 'r3' }), row({ id: 'r4' })], hasMore: false, nextCursor: null };
    };
    const { rows, truncated } = await fetchAllIncomeRows(smallFetch, 3);
    expect(rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(truncated).toBe(true);
  });

  it('reports no truncation when the ledger fits exactly in the cap', async () => {
    const fetchPage = async () => ({
      rows: [row({ id: 'r1' }), row({ id: 'r2' })],
      hasMore: false,
      nextCursor: null,
    });
    const { rows, truncated } = await fetchAllIncomeRows(fetchPage, 2);
    expect(rows).toHaveLength(2);
    expect(truncated).toBe(false);
  });
});

describe('buildIncomeStatementHtml', () => {
  it('renders an RTL Arabic document with the lifetime total and both sums', () => {
    const html = buildIncomeStatementHtml({
      rows: [row({ paymentAmountEgp: 1000 }), row({ id: 'r2', paymentAmountEgp: 500 })],
      lifetimeTotalEgp: 1500,
      generatedAt: new Date('2026-11-23T09:30:00.000Z'),
      truncated: false,
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('كشف دخل — نظام RQ');
    expect(html).toContain('إجمالي الدخل الكلي');
    expect(html).toContain((1500).toLocaleString('ar-EG'));
    expect(html).toContain('إجمالي العمليات المدرجة');
    expect(html).toContain((1500).toLocaleString('ar-EG'));
    expect(html).toContain('جراج النور');
    expect(html).toContain('الفترة:');
  });

  it('escapes user-provided text so the printed document cannot be injected', () => {
    const html = buildIncomeStatementHtml({
      rows: [row({ garageName: '<script>alert(1)</script>', reason: 'دفع & تهريب' })],
      lifetimeTotalEgp: 1000,
      generatedAt: new Date(),
      truncated: false,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('دفع &amp; تهريب');
  });

  it('discloses truncation loudly when the cap bit', () => {
    const html = buildIncomeStatementHtml({
      rows: [row()],
      lifetimeTotalEgp: 1000,
      generatedAt: new Date(),
      truncated: true,
    });
    expect(html).toContain('class="warn"');
    expect(html).toContain('أول');
    expect(html).toContain(String(INCOME_EXPORT_MAX_ROWS));
  });

  it('renders an explicit empty state instead of an empty table', () => {
    const html = buildIncomeStatementHtml({
      rows: [],
      lifetimeTotalEgp: 0,
      generatedAt: new Date(),
      truncated: false,
    });
    expect(html).toContain('لا يوجد دخل مسجل.');
    expect(html).not.toContain('الفترة:');
  });
});
