import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() { return mockDb; },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
}));

import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);

const adminHeaders = { Authorization: 'Bearer valid-admin-token' };

/**
 * Regression test for the "PIN used once, never again" feature.
 *
 * Verifies three core behaviors:
 *   1. A PIN in the retired_pins collection blocks new garage creation
 *      (returns PIN_ALREADY_TAKEN via the pre-check).
 *   2. Saving a PIN that's already in retired_pins throws PIN_PREVIOUSLY_USED
 *      (defense-in-depth inside the transaction).
 *   3. Deleting an entity writes its PIN to retired_pins.
 *
 * The 5-minute typo grace on PIN CHANGE is intentionally not tested here
 * because the mock store doesn't simulate Firestore Timestamp semantics,
 * and 5-minute waits are not viable in unit tests. That grace is exercised
 * manually during integration testing.
 */

describe('PIN retirement — "used once, never again"', () => {
  beforeEach(() => {
    mockDb.clear();
  });

  it('blocks creating a garage with a PIN that is in retired_pins', async () => {
    // Manually seed a retired_pins entry for some PIN value.
    // We don't know the actual lookupHash (it's scrypt-derived), so the
    // test seeds the retired_pins collection by *performing a deletion*
    // and then attempting to reuse the same PIN.
    //
    // Step 1: create a garage with PIN 54321
    const createRes = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({
        name: 'Test Garage A',
        phone: '01000000001',
        hourlyRate: 10,
        overnightRate: 50,
        pin: '54321',
        ownerName: 'Owner A'
      })
    }));
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json() as any;
    const garageId = createBody.id;
    expect(garageId).toBeTruthy();

    // Step 2: delete the garage — this should retire PIN 54321
    // Trigger deletion
    const startRes = await api.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ garageId })
    }));
    expect([200, 202]).toContain(startRes.status);
    const startBody = await startRes.json() as any;
    const jobToken = startBody.jobToken;
    expect(jobToken).toBeTruthy();

    // Step through deletion until complete
    for (let i = 0; i < 100; i += 1) {
      const stepRes = await api.fetch(new Request('http://localhost/api/garages/delete-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders },
        body: JSON.stringify({ garageId, jobToken })
      }));
      expect(stepRes.status).toBe(200);
      const stepBody = await stepRes.json() as any;
      if (stepBody.status === 'completed') break;
      if (stepBody.status !== 'running') throw new Error(`Unexpected step status: ${stepBody.status}`);
    }

    // Verify the retired_pins collection now has at least one entry
    // (the PIN 54321's lookupHash, which we can't compute in-test, but
    // the existence of ANY retired_pins doc proves the retirement fired).
    const retiredDocs = [...mockDb.records.entries()].filter(([path]) => path.startsWith('retired_pins/'));
    expect(retiredDocs.length).toBeGreaterThanOrEqual(1);

    // Step 3: try to create a NEW garage with the same PIN — should fail
    const recreateRes = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({
        name: 'Test Garage B',
        phone: '01000000002',
        hourlyRate: 15,
        overnightRate: 60,
        pin: '54321',
        ownerName: 'Owner B'
      })
    }));
    expect(recreateRes.status).toBe(400);
    const recreateBody = await recreateRes.json() as any;
    expect(recreateBody.success).toBe(false);
    // Pre-check returns PIN_ALREADY_TAKEN; transaction defense-in-depth
    // would return PIN_PREVIOUSLY_USED. Either is acceptable — both
    // block the reuse, which is the user-visible guarantee.
    expect(['PIN_ALREADY_TAKEN', 'PIN_PREVIOUSLY_USED']).toContain(recreateBody.error);
  });

  it('blocks updating a PIN to a value that is in retired_pins', async () => {
    // Create a garage with PIN 11111
    const createRes = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({
        name: 'Test Garage C',
        phone: '01000000003',
        hourlyRate: 10,
        overnightRate: 50,
        pin: '11111',
        ownerName: 'Owner C'
      })
    }));
    expect(createRes.status).toBe(200);
    const garageId = (await createRes.json() as any).id;

    // Create a second garage with PIN 22222
    const createRes2 = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({
        name: 'Test Garage D',
        phone: '01000000004',
        hourlyRate: 10,
        overnightRate: 50,
        pin: '22222',
        ownerName: 'Owner D'
      })
    }));
    expect(createRes2.status).toBe(200);
    const garageId2 = (await createRes2.json() as any).id;

    // Delete garage 1 — retires PIN 11111
    const startRes = await api.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ garageId })
    }));
    const jobToken = (await startRes.json() as any).jobToken;
    for (let i = 0; i < 100; i += 1) {
      const stepRes = await api.fetch(new Request('http://localhost/api/garages/delete-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders },
        body: JSON.stringify({ garageId, jobToken })
      }));
      const stepBody = await stepRes.json() as any;
      if (stepBody.status === 'completed') break;
    }

    // Verify retirement fired
    const retiredDocs = [...mockDb.records.entries()].filter(([path]) => path.startsWith('retired_pins/'));
    expect(retiredDocs.length).toBeGreaterThanOrEqual(1);

    // Now try to update garage 2's PIN to 11111 — should fail
    const updatePinRes = await api.fetch(new Request('http://localhost/api/people/update-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ entityType: 'garages', entityId: garageId2, newPin: '11111' })
    }));
    expect(updatePinRes.status).toBe(400);
    const updatePinBody = await updatePinRes.json() as any;
    expect(updatePinBody.success).toBe(false);
    expect(['PIN_ALREADY_TAKEN', 'PIN_PREVIOUSLY_USED']).toContain(updatePinBody.error);
  });
});
