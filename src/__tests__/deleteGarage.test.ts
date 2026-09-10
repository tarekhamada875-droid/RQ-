import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  });

  it('1. should delete garage and report progress properly', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/api/garages/delete')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const progressLog: any[] = [];
    await firestoreService.deleteGarage('test_garage', (progress) => {
      progressLog.push(progress);
    });

    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/garages/delete'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ garageId: 'test_garage' })
    }));

    expect(progressLog.length).toBeGreaterThan(0);
    expect(progressLog[progressLog.length - 1].percentage).toBe(100);
    expect(progressLog[progressLog.length - 1].phase).toBe('complete');
  });
});
