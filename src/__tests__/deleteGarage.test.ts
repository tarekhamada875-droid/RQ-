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
      .mockResolvedValueOnce({ success: true, status: 'running', processedRecords: 0, jobToken: 'synthetic-job-token' })
      .mockResolvedValueOnce({ success: true, status: 'running', phase: 'deleting', processedRecords: 17 })
      .mockResolvedValueOnce({ success: true, status: 'running', phase: 'finalizing', processedRecords: 23 })
      .mockResolvedValueOnce({ success: true, status: 'completed', phase: 'complete', processedRecords: 23 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the server deletion status without starting another delete', async () => {
    apiFetchMock.mockReset().mockResolvedValueOnce({
      success: true,
      status: 'running',
      phase: 'deleting',
      processedRecords: 17,
      errorCode: null,
      retryable: false
    });

    await expect(firestoreService.getGarageDeletionStatus('garage 1')).resolves.toEqual({
      status: 'running',
      phase: 'deleting',
      processedRecords: 17,
      errorCode: null,
      retryable: false
    });
    expect(apiFetchMock).toHaveBeenCalledWith('/api/garages/delete-status?garageId=garage%201');
  });

  it('reports a missing deletion job as not started', async () => {
    apiFetchMock.mockReset().mockRejectedValueOnce(
      Object.assign(new Error('DELETION_JOB_NOT_FOUND'), { code: 'DELETION_JOB_NOT_FOUND' })
    );

    await expect(firestoreService.getGarageDeletionStatus('test_garage')).resolves.toEqual({
      status: 'not_started',
      processedRecords: 0,
      errorCode: null,
      retryable: false
    });
    expect(apiFetchMock).toHaveBeenCalledWith('/api/garages/delete-status?garageId=test_garage');
  });

  it('starts a deletion job, advances bounded server steps, and reports only server progress', async () => {
    const progressLog: any[] = [];

    await firestoreService.deleteGarage('test_garage', (progress) => {
      progressLog.push(progress);
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/api/garages/delete', expect.objectContaining({
      method: 'POST',
      body: { garageId: 'test_garage' },
      timeoutMs: 15_000
    }));
    for (const callIndex of [2, 3, 4]) {
      expect(apiFetchMock).toHaveBeenNthCalledWith(callIndex, '/api/garages/delete-step', expect.objectContaining({
        method: 'POST',
        body: { garageId: 'test_garage', jobToken: 'synthetic-job-token' },
        timeoutMs: 15_000
      }));
    }

    expect(progressLog).toContainEqual({ processed: 17, phase: 'deleting' });
    expect(progressLog).toContainEqual({ processed: 23, phase: 'finalizing' });
    expect(progressLog[progressLog.length - 1]).toEqual({ processed: 23, phase: 'complete' });
    expect(progressLog.every((progress) => !('percentage' in progress))).toBe(true);
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });
});
