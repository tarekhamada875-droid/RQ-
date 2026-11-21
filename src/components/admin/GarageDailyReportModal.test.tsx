/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Tests for the owner-redesigned daily report modal (2026-11-22):
 *  - the day list shows ONLY days that have operations (no full calendar);
 *  - the list lives behind ONE select-style button, inside a capped
 *    scrollable panel (owner fix: the always-visible list filled the screen
 *    and could not scroll);
 *  - a day with ≤ 200 ops downloads directly;
 *  - a day with > 200 ops offers "latest 200" vs "ALL" before fetching;
 *  - "ALL" paginates through the whole day.
 *
 * Firestore is mocked at the module boundary. The component computes day
 * bounds with the real getCairoDayBounds, so the mock keys its canned data
 * by the query's start-timestamp ISO string — no date math duplicated here.
 */

const firestoreMocks = vi.hoisted(() => ({
  // start-timestamp ISO -> count of operations that day
  countsByStart: new Map<string, number>(),
  // start-timestamp ISO -> that day's logs (newest first)
  docsByStart: new Map<Array<string>, never>() as unknown as Map<string, Array<Record<string, unknown>>>,
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  query: vi.fn((...parts: unknown[]) => parts),
  collection: vi.fn((...parts: unknown[]) => ({ kind: 'collection', parts })),
  orderBy: vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({ kind: 'where', field, operator, value })),
  startAfter: vi.fn((doc: unknown) => ({ kind: 'startAfter', doc })),
  Timestamp: { fromDate: vi.fn((date: Date) => date) },
  showToast: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  query: firestoreMocks.query,
  where: firestoreMocks.where,
  orderBy: firestoreMocks.orderBy,
  limit: firestoreMocks.limit,
  startAfter: firestoreMocks.startAfter,
  getDocs: firestoreMocks.getDocs,
  getCountFromServer: firestoreMocks.getCountFromServer,
  Timestamp: firestoreMocks.Timestamp,
}));

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../hooks/toast', () => ({
  useToast: () => ({ showToast: firestoreMocks.showToast }),
}));

import { GarageDailyReportModal } from './GarageDailyReportModal';
import { getCairoDayBounds } from '../../../server/projections';

// The component reads the real clock for "today" (initial month, future-day
// clamp). Fake ONLY Date — timers/promises stay real so the async mocks work.
const FIXED_NOW = new Date('2026-11-15T10:00:00.000Z');

function startKeyOf(dateId: string): string {
  return getCairoDayBounds(dateId).start.toISOString();
}

function setDay(dateId: string, count: number, logCount = count): void {
  const key = startKeyOf(dateId);
  firestoreMocks.countsByStart.set(key, count);
  const startMs = getCairoDayBounds(dateId).start.getTime();
  // Newest-first docs, one second apart, inside the day window.
  const docs = Array.from({ length: logCount }, (_, i) => ({
    id: `${dateId}-log-${String(i).padStart(3, '0')}`,
    garageId: 'g1',
    timestamp: new Date(startMs + (logCount - i) * 1000),
    actionType: 'check_in',
    plateNumber: `abc ${i}`,
    staffName: 'موظف',
    amount: 5,
  }));
  firestoreMocks.docsByStart.set(key, docs);
}

const dayStartKeyFromParts = (parts: unknown[]): string => {
  const startWhere = parts.find(p => typeof p === 'object' && p !== null
    && (p as any).kind === 'where' && (p as any).field === 'timestamp' && (p as any).operator === '>=');
  const value = (startWhere as any)?.value as Date | undefined;
  if (!(value instanceof Date)) throw new Error('mock query missing timestamp >= bound');
  return value.toISOString();
};

const garageStub = (id: string) => ({
  id,
  name: 'جراج الشع11',
  createdAt: '2026-10-01T00:00:00.000Z',
}) as any;

function renderModal(id: string) {
  return render(<GarageDailyReportModal garage={garageStub(id)} onClose={vi.fn()} />);
}

describe('GarageDailyReportModal — active-days list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    firestoreMocks.countsByStart = new Map();
    firestoreMocks.docsByStart = new Map();

    firestoreMocks.getCountFromServer.mockImplementation(async (parts: unknown[]) => {
      const key = dayStartKeyFromParts(parts);
      const count = firestoreMocks.countsByStart.get(key) ?? 0;
      return { data: () => ({ count }) };
    });
    firestoreMocks.getDocs.mockImplementation(async (parts: unknown[]) => {
      const key = dayStartKeyFromParts(parts);
      const docs = firestoreMocks.docsByStart.get(key) ?? [];
      const isPaged = parts.some(p => typeof p === 'object' && p !== null && (p as any).kind === 'startAfter');
      const limitPart = parts.find(p => typeof p === 'object' && p !== null && (p as any).kind === 'limit') as any;
      const size = limitPart?.count ?? 200;
      const slice = isPaged ? docs.slice(size, size * 2) : docs.slice(0, size);
      return { docs: slice.map(d => ({ id: d.id as string, data: () => d })) };
    });

    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists only the days that have operations, newest first, with their counts', async () => {
    setDay('2026-11-03', 3);
    setDay('2026-11-10', 45);
    setDay('2026-11-14', 348);

    renderModal('g-list');

    // The day list lives behind one select-style button (dropdown design).
    fireEvent.click(await screen.findByRole('button', { name: 'اختر يوماً' }));

    // Zero-operation days (e.g. Nov 7) never appear; the three active ones do.
    const rows = await screen.findAllByRole('listitem');
    await waitFor(() => expect(rows).toHaveLength(3));
    expect(screen.getByText('٣ عمليات')).toBeInTheDocument();       // Nov 3
    expect(screen.getByText('٤٥ عملية')).toBeInTheDocument();       // Nov 10
    expect(screen.getByText('٣٤٨ عملية')).toBeInTheDocument();      // Nov 14
    // Newest first: the 348-op day (Nov 14) is the first row.
    expect(rows[0]).toHaveTextContent('٣٤٨ عملية');
  });

  it('shows an empty state when the month has no operations at all', async () => {
    renderModal('g-empty');
    expect(await screen.findByText('لا توجد عمليات في هذا الشهر')).toBeInTheDocument();
  });

  it('downloads directly (latest-200 query) when tapping a day with ≤ 200 operations', async () => {
    setDay('2026-11-10', 45);
    renderModal('g-small');

    fireEvent.click(await screen.findByRole('button', { name: 'اختر يوماً' }));
    fireEvent.click(await screen.findByRole('listitem'));

    await waitFor(() => expect(firestoreMocks.showToast).toHaveBeenCalled());
    expect(firestoreMocks.showToast).toHaveBeenCalledWith(expect.stringContaining('سجل'), 'success');
    // Single fetch, capped at the fast limit (45 < 200 → all 45 come back).
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
    const parts = firestoreMocks.getDocs.mock.calls[0][0] as unknown[];
    expect(parts.some(p => (p as any)?.kind === 'limit' && (p as any).count === 200)).toBe(true);
  });

  it('offers latest-200 vs ALL for a day with more than 200 operations', async () => {
    setDay('2026-11-14', 348);
    renderModal('g-choice');

    fireEvent.click(await screen.findByRole('button', { name: 'اختر يوماً' }));
    fireEvent.click(await screen.findByRole('listitem'));

    // Nothing fetched while the choice is open.
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
    expect(await screen.findByText(/هذا اليوم فيه ٣٤٨ عملية/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تحميل آخر ٢٠٠ عملية فقط' }));

    await waitFor(() => expect(firestoreMocks.showToast).toHaveBeenCalled());
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
    const parts = firestoreMocks.getDocs.mock.calls[0][0] as unknown[];
    expect(parts.some(p => (p as any)?.kind === 'limit' && (p as any).count === 200)).toBe(true);
  });

  it('downloads every operation (paginated) when the admin picks ALL', async () => {
    setDay('2026-11-14', 600);
    renderModal('g-all');

    fireEvent.click(await screen.findByRole('button', { name: 'اختر يوماً' }));
    fireEvent.click(await screen.findByRole('listitem'));
    fireEvent.click(await screen.findByRole('button', { name: 'تحميل كل العمليات (٦٠٠)' }));

    await waitFor(() => expect(firestoreMocks.showToast).toHaveBeenCalled());
    // 600 docs = one full 500-page + one 100-doc short page → exactly two fetches.
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(2);
    const firstPage = firestoreMocks.getDocs.mock.calls[0][0] as unknown[];
    const secondPage = firestoreMocks.getDocs.mock.calls[1][0] as unknown[];
    expect(firstPage.some(p => (p as any)?.kind === 'limit' && (p as any).count === 500)).toBe(true);
    expect(firstPage.some(p => (p as any)?.kind === 'startAfter')).toBe(false);
    expect(secondPage.some(p => (p as any)?.kind === 'startAfter')).toBe(true);
    expect(firestoreMocks.showToast).toHaveBeenCalledWith(expect.stringContaining('600'), 'success');
  });
});
