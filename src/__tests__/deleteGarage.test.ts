import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiClient')>();
  return { ...actual, apiFetch: apiFetchMock };
});
import { firestoreService } from '../services';

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('mock_token') } },
  handleFirestoreError: vi.fn((err) => { throw err; }),
  OperationType: { DELETE: 'DELETE' }
}));

describe('v167 - Garage Deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock
      .mockResolvedValueOnce({ success: true, status: 'running', processedRecords: 0 })
      .mockResolvedValueOnce({ success: true, status: 'running', phase: 'deleting', processedRecords: 17 })
      .mockResolvedValueOnce({ success: true, status: 'completed', phase: 'complete', processedRecords: 23 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a deletion job, polls status, and reports only server progress', async () => {
    const progressLog: any[] = [];

    await firestoreService.deleteGarage('test_garage', (progress) => {
      progressLog.push(progress);
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/api/garages/delete', expect.objectContaining({
      method: 'POST',
      body: { garageId: 'test_garage' },
      timeoutMs: 15_000
    }));
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/api/garages/delete-status?garageId=test_garage', expect.objectContaining({
      timeoutMs: 15_000
    }));
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, '/api/garages/delete-status?garageId=test_garage', expect.objectContaining({
      timeoutMs: 15_000
    }));

    expect(progressLog).toContainEqual({ processed: 17, phase: 'deleting' });
    expect(progressLog[progressLog.length - 1]).toEqual({ processed: 23, phase: 'complete' });
    expect(progressLog.every((progress) => !('percentage' in progress))).toBe(true);
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });
});
