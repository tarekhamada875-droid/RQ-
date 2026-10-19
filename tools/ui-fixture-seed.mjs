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

const documents = [
  ['admin_settings/auth_pin', {
    pin: '1234567890',
    adminColor: '#10b981',
    createdAt: now,
    updatedAt: now,
  }],
  ['private_pins/auth_pin', {
    entityType: 'admin_settings',
    entityId: 'auth_pin',
    pin: '1234567890',
    pinLookupHash: lookupHash('1234567890'),
    createdAt: now,
    updatedAt: now,
  }],
  [`garages/${fixtureGarageId}`, {
    id: fixtureGarageId,
    name: 'UI Fixture Garage',
    phone: '01000000000',
    pin: '1234567891',
    ownerPin: '1234567891',
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
    pin: '1234567891',
    pinLookupHash: lookupHash('1234567891'),
    createdAt: now,
    updatedAt: now,
  }],
  [`staff/${fixtureStaffId}`, {
    id: fixtureStaffId,
    name: 'UI Fixture Staff',
    pin: '1234567892',
    garageId: fixtureGarageId,
    role: 'staff',
    permissions: { checkIn: true, checkOut: true, reports: true },
    createdAt: now,
    updatedAt: now,
  }],
  [`private_pins/${fixtureStaffId}`, {
    entityType: 'staff',
    entityId: fixtureStaffId,
    pin: '1234567892',
    pinLookupHash: lookupHash('1234567892'),
    createdAt: now,
    updatedAt: now,
  }],
  [`delegates/${fixtureDelegateId}`, {
    id: fixtureDelegateId,
    name: 'UI Fixture Delegate',
    phone: '01000000001',
    pin: '1234567893',
    commissionRate: 5,
    createdAt: now,
    updatedAt: now,
  }],
  [`private_pins/${fixtureDelegateId}`, {
    entityType: 'delegates',
    entityId: fixtureDelegateId,
    pin: '1234567893',
    pinLookupHash: lookupHash('1234567893'),
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
  [`garages/${fixtureGarageId}/packages/ui-fixture-package`, {
    id: 'ui-fixture-package',
    name: 'UI Fixture Credits',
    credits: 100,
    price: 1000,
    active: true,
    createdAt: now,
    updatedAt: now,
  }],
];

const batch = db.batch();
for (const [path, data] of documents) batch.set(db.doc(path), data, { merge: true });
await batch.commit();
console.log(JSON.stringify({ seeded: documents.length, projectId, fixtureGarageId, fixtureStaffId, fixtureDelegateId }, null, 2));
