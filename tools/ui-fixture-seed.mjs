#!/usr/bin/env node
import crypto from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to seed UI fixtures without FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST');
}

const projectId = process.env.GCLOUD_PROJECT || 'demo-rq-ui-fixtures';
const app = initializeApp({ projectId });
const db = getFirestore(app);
const now = new Date('2026-10-19T12:00:00.000Z');

const fixtureGarageId = 'ui-fixture-garage';
const fixtureStaffId = 'ui-fixture-staff';
const fixtureDelegateId = 'ui-fixture-delegate';
const lookupSalt = 'ark_garage_secure_pin_lookup_salt_v2';
const lookupHash = pin => crypto.scryptSync(pin, lookupSalt, 32).toString('hex');

// All fixture PINs follow the REAL five-digit PIN contract
// (server/validation.ts isNewPinFormat → validateNewPin: /^\d{5}$/ on every
// create/change flow; login only tolerates legacy eight-digit credentials).
// The previous fixture PINs were eight digits — a legacy shape no new
// account can ever have.
//
// private_pins.pin must match the production contract written by
// pinRepository.setPrivatePin: hashPinWithUniqueSalt's "$scrypt$N=..,r=..,p=..$<salthex>$<derived>"
// format. verifyDocMatch re-verifies every hash-lookup candidate through
// verifySingleFieldValue, which ONLY accepts this format — a plaintext pin
// (the previous fixture format) is silently discarded and login fails with
// "بيانات الدخول غير صحيحة" even though the pinLookupHash query matched.
//
// Entity docs (garages/staff/delegates/admin_settings) deliberately carry
// NO plaintext pin field — production writes credentials only to
// private_pins (admin_settings/auth_pin even has its legacy pin nulled:
// workerSessionRoutes.ts set({ pin: null, ... })).
const scryptPin = pin => {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 32, { N, r, p }).toString('hex');
  return `$scrypt$N=${N},r=${r},p=${p}$${salt.toString('hex')}$${derived}`;
};

const documents = [
  ['admin_settings/auth_pin', {
    adminColor: '#10b981',
    createdAt: now,
    updatedAt: now,
  }],
  ['private_pins/auth_pin', {
    entityType: 'admin_settings',
    entityId: 'auth_pin',
    pin: scryptPin('47159'),
    pinLookupHash: lookupHash('47159'),
    createdAt: now,
    updatedAt: now,
  }],
  [`garages/${fixtureGarageId}`, {
    id: fixtureGarageId,
    name: 'UI Fixture Garage',
    phone: '01000000000',
    address: 'Local emulator only',
    rate: 25,
    balance: 500,
    totalCars: 12,
    totalRevenue: 875,
    shimmerColor: '#10b981',
    createdAt: now,
    updatedAt: now,
  }],
  [`private_pins/${fixtureGarageId}`, {
    entityType: 'garages',
    entityId: fixtureGarageId,
    pin: scryptPin('52841'),
    pinLookupHash: lookupHash('52841'),
    createdAt: now,
    updatedAt: now,
  }],
  [`staff/${fixtureStaffId}`, {
    id: fixtureStaffId,
    name: 'UI Fixture Staff',
    garageId: fixtureGarageId,
    role: 'staff',
    permissions: { checkIn: true, checkOut: true, reports: true },
    createdAt: now,
    updatedAt: now,
  }],
  [`private_pins/${fixtureStaffId}`, {
    entityType: 'staff',
    entityId: fixtureStaffId,
    pin: scryptPin('60372'),
    pinLookupHash: lookupHash('60372'),
    createdAt: now,
    updatedAt: now,
  }],
  [`delegates/${fixtureDelegateId}`, {
    id: fixtureDelegateId,
    name: 'UI Fixture Delegate',
    phone: '01000000001',
    commissionRate: 5,
    createdAt: now,
    updatedAt: now,
  }],
  [`private_pins/${fixtureDelegateId}`, {
    entityType: 'delegates',
    entityId: fixtureDelegateId,
    pin: scryptPin('83614'),
    pinLookupHash: lookupHash('83614'),
    createdAt: now,
    updatedAt: now,
  }],
  [`garages/${fixtureGarageId}/vehicles/ui-fixture-vehicle`, {
    id: 'ui-fixture-vehicle',
    plateNumber: '123 456',
    plateNumberRaw: '123456',
    status: 'outside',
    type: 'hourly',
    entryTime: now,
    staffName: 'UI Fixture Staff',
    createdAt: now,
    updatedAt: now,
  }],
  [`garages/${fixtureGarageId}/subscribers/ui-fixture-subscriber`, {
    id: 'ui-fixture-subscriber',
    name: 'UI Fixture Subscriber',
    phone: '01000000002',
    plateNumber: '123 457',
    plateNumberRaw: '123457',
    fee: 300,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    active: true,
    createdAt: now,
    updatedAt: now,
  }],
];

const batch = db.batch();
for (const [path, data] of documents) batch.set(db.doc(path), data, { merge: true });
await batch.commit();
console.log(JSON.stringify({ seeded: documents.length, projectId, fixtureGarageId, fixtureStaffId, fixtureDelegateId }, null, 2));
