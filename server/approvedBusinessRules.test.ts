import { describe, expect, it } from 'vitest';
import { ValidationError, validateDateRange } from './validation';
import { recordDomainEventInTransaction } from './events';

describe('approved business rules', () => {
  describe('subscriber date ranges', () => {
    it('accepts valid same-day and forward date ranges', () => {
      expect(validateDateRange('2026-09-13', '2026-09-13')).toEqual({
        startDate: '2026-09-13',
        endDate: '2026-09-13',
      });
      expect(validateDateRange('2026-09-13', '2026-10-01').endDate).toBe('2026-10-01');
    });

    it('rejects malformed or impossible calendar dates', () => {
      expect(() => validateDateRange('2026-02-30', '2026-03-01')).toThrow(ValidationError);
      expect(() => validateDateRange('13-09-2026', '2026-10-01')).toThrow(ValidationError);
    });

    it('rejects an end date before the start date', () => {
      expect(() => validateDateRange('2026-10-01', '2026-09-13')).toThrowError(
        expect.objectContaining({ code: 'INVALID_SUBSCRIBER_DATE_RANGE' }),
      );
    });
  });

  describe('domain events ledger & safety', () => {
    it('creates structured domain event and redacts sensitive credentials from payload', () => {
      let writtenPath = '';
      let writtenDoc: any = null;

      const mockTransaction = {
        set: (docRef: any, data: any) => {
          writtenPath = docRef.path;
          writtenDoc = data;
        }
      };

      const mockAdminDb = {
        doc: (path: string) => ({ path })
      };

      const event = recordDomainEventInTransaction(mockTransaction, mockAdminDb, {
        garageId: 'gar_test_123',
        aggregateType: 'vehicle',
        aggregateId: 'س ص ج 1234',
        eventType: 'vehicle_entered',
        actorUid: 'usr_staff_1',
        actorRole: 'garage',
        payload: {
          plateNumber: 'س ص ج 1234',
          type: 'hourly',
          pin: '123456',
          password: 'secretPassword',
          token: 'bearer_token_123',
          nested: { authorization: 'Bearer secret', safe: true }
        }
      });

      expect(event.garageId).toBe('gar_test_123');
      expect(event.aggregateType).toBe('vehicle');
      expect(event.eventType).toBe('vehicle_entered');
      expect(event.schemaVersion).toBe(1);
      expect(writtenPath).toContain('garages/gar_test_123/events/');

      // Check payload sanitization
      expect(writtenDoc.payload.plateNumber).toBe('س ص ج 1234');
      expect(writtenDoc.payload.type).toBe('hourly');
      expect(writtenDoc.payload.pin).toBeUndefined();
      expect(writtenDoc.payload.password).toBeUndefined();
      expect(writtenDoc.payload.token).toBeUndefined();
      expect(writtenDoc.payload.nested.authorization).toBeUndefined();
      expect(writtenDoc.payload.nested.safe).toBe(true);
    });

    it('records delegate_settled financial domain event correctly', () => {
      let writtenDoc: any = null;
      const mockTransaction = {
        set: (_docRef: any, data: any) => {
          writtenDoc = data;
        }
      };
      const mockAdminDb = {
        doc: (path: string) => ({ path })
      };

      const event = recordDomainEventInTransaction(mockTransaction, mockAdminDb, {
        garageId: 'delegate_del_99',
        aggregateType: 'delegate',
        aggregateId: 'del_99',
        eventType: 'delegate_settled',
        actorUid: 'admin_1',
        actorRole: 'admin',
        eventCollectionPath: 'delegates/del_99/events',
        payload: {
          delegateId: 'del_99',
          settlementId: 'set_del_99_1',
          previousRechargedAmount: 1500,
          settledAt: '2026-09-15T00:00:00.000Z'
        }
      });

      expect(event.eventType).toBe('delegate_settled');
      expect(writtenDoc.payload.previousRechargedAmount).toBe(1500);
      expect(writtenDoc.payload.delegateId).toBe('del_99');
    });

    it('rejects an event whose aggregate type does not match its event type', () => {
      expect(() => recordDomainEventInTransaction({ set: () => undefined }, { doc: (path: string) => ({ path }) }, {
        garageId: 'gar_test_123',
        aggregateType: 'delegate',
        aggregateId: 'del_99',
        eventType: 'vehicle_entered',
        actorUid: 'admin_1',
        actorRole: 'admin',
        payload: {}
      })).toThrow('INVALID_EVENT_AGGREGATE');
    });

    it('rejects a delegate settlement event without a permanent settlement id', () => {
      expect(() => recordDomainEventInTransaction({ set: () => undefined }, { doc: (path: string) => ({ path }) }, {
        garageId: 'global',
        aggregateType: 'delegate',
        aggregateId: 'del_99',
        eventType: 'delegate_settled',
        actorUid: 'admin_1',
        actorRole: 'admin',
        payload: {
          delegateId: 'del_99',
          previousRechargedAmount: 1500,
          settledAt: '2026-09-15T00:00:00.000Z'
        }
      })).toThrow('INVALID_DELEGATE_SETTLEMENT_PAYLOAD');
    });
  });
});
