import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('../api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiClient')>();
  return { ...actual, apiFetch: apiFetchMock };
});
import { firestoreService } from '../services';
import { deleteGarageWithRecovery, garageDeletionFailureMessage } from '../services/garageDeletionService';

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

  it('does not spend an extra status read after an explicit rate-limit rejection', async () => {
    const error = Object.assign(new Error('RATE_LIMIT_EXCEEDED'), {
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
      envelope: { retryAfterSeconds: 37 }
    });
    apiFetchMock.mockReset().mockRejectedValueOnce(error);

    const result = await deleteGarageWithRecovery('test_garage');

    expect(result).toMatchObject({ ok: false, errorCode: 'RATE_LIMIT_EXCEEDED', status: null });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    if (result.ok === false) {
      expect(garageDeletionFailureMessage(result)).toContain('37 ثانية');
    }
  });

  it('checks deletion status only when the start request outcome is ambiguous', async () => {
    apiFetchMock.mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('API_TIMEOUT'), { code: 'API_TIMEOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('DELETION_JOB_NOT_FOUND'), { code: 'DELETION_JOB_NOT_FOUND' }));

    const result = await deleteGarageWithRecovery('test_garage');

    expect(result).toMatchObject({ ok: false, errorCode: 'API_TIMEOUT', status: { status: 'not_started' } });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/api/garages/delete-status?garageId=test_garage');
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a completed job as success if the original response was lost', async () => {
    apiFetchMock.mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce({ status: 'completed', processedRecords: 12, errorCode: null, retryable: false });

    await expect(deleteGarageWithRecovery('test_garage')).resolves.toEqual({ ok: true });
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks job status after a server 500 because the claim may already have committed', async () => {
    apiFetchMock.mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('INTERNAL_ERROR'), { code: 'INTERNAL_ERROR', status: 500 }))
      .mockResolvedValueOnce({ status: 'stale', processedRecords: 0, errorCode: null, retryable: true });

    const result = await deleteGarageWithRecovery('test_garage');

    expect(result).toMatchObject({ ok: false, errorCode: 'INTERNAL_ERROR', status: { status: 'stale' } });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/api/garages/delete-status?garageId=test_garage');
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    if (result.ok === false) {
      expect(garageDeletionFailureMessage(result, 'en')).toContain('توقفت عملية الحذف قبل اكتمالها');
    }
  });
});
