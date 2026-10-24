import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../utils/ThemeContext';

const { getActivityLogsSinceMock } = vi.hoisted(() => ({
  getActivityLogsSinceMock: vi.fn()
}));

vi.mock('../../services', () => ({
  firestoreService: {
    getActivityLogsSince: getActivityLogsSinceMock
  }
}));

import { ActivityLogExportModal } from './ActivityLogExportModal';

let exportedBlob: Blob | null = null;
let originalCreateObjectURL: PropertyDescriptor | undefined;
let originalRevokeObjectURL: PropertyDescriptor | undefined;

beforeEach(() => {
  exportedBlob = null;
  getActivityLogsSinceMock.mockReset().mockResolvedValue([{
    id: 'grant-1',
    timestamp: new Date('2026-10-24T07:00:00.000Z'),
    garageName: 'جراج الاختبار',
    staffName: 'مدير الجراج',
    actionType: 'prepaid_credit_grant_paid',
    amount: 50,
    plateNumber: 'ABC-123'
  }]);

  originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:activity-export-test';
    })
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
  else delete (URL as any).createObjectURL;
  if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  else delete (URL as any).revokeObjectURL;
});

describe('ActivityLogExportModal Arabic-only export', () => {
  it('exports active credit-grant activity with Arabic labels and filename', async () => {
    const setAttributeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'setAttribute');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <ThemeProvider>
        <ActivityLogExportModal onClose={vi.fn()} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'تحميل الملف' }));

    await waitFor(() => {
      expect(screen.getByText(/تم تصدير وتحميل الملف بنجاح/)).toBeInTheDocument();
    });

    expect(getActivityLogsSinceMock).toHaveBeenCalledOnce();
    expect(setAttributeSpy).toHaveBeenCalledWith(
      'download',
      expect.stringMatching(/^سجل-العمليات-\d{4}-\d{2}-\d{2}-اليوم\.csv$/)
    );
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(exportedBlob).toBeInstanceOf(Blob);

    const csv = await exportedBlob!.text();
    expect(csv).toContain('منح رصيد مدفوع');
    expect(csv).not.toContain('prepaid_credit_grant_paid');
  });
});
