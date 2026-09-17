import { describe, test, expect, beforeEach, vi } from 'vitest';
import { firestoreService } from '../services';

describe('Garage Creation PIN Availability & Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      const body = JSON.parse(options?.body || '{}');

      if (urlStr.includes('/api/auth/check-pin-availability')) {
        // Mock existing PINs in the system
        if (body.pin === '88888888') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              taken: true,
              role: 'مسؤول النظام (الآدمن الرئيسي)',
              name: 'الآدمن'
            })
          } as any;
        }

        if (body.pin === '11223344') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              taken: true,
              role: 'صاحب جراج',
              name: 'جراج التحرير'
            })
          } as any;
        }

        // Newly generated unique PIN is available
        return {
          ok: true,
          status: 200,
          json: async () => ({
            taken: false
          })
        } as any;
      }

      if (urlStr.includes('/api/garages/create')) {
        if (body.pin === '88888888' || body.pin === '11223344') {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              success: false,
              error: 'PIN_ALREADY_TAKEN',
              takenBy: { name: 'جراج التحرير', role: 'صاحب جراج' }
            })
          } as any;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            id: 'new_garage_789'
          })
        } as any;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      } as any;
    });
  });

  test('allows newly generated unique PIN and confirms availability', async () => {
    const uniquePin = '59281467';
    const check = await firestoreService.isPinTaken(uniquePin);
    expect(check.taken).toBe(false);
  });

  test('detects already taken PIN correctly with role information', async () => {
    const adminPin = '88888888';
    const checkAdmin = await firestoreService.isPinTaken(adminPin);
    expect(checkAdmin.taken).toBe(true);
    expect(checkAdmin.role).toContain('الآدمن');

    const garagePin = '11223344';
    const checkGarage = await firestoreService.isPinTaken(garagePin);
    expect(checkGarage.taken).toBe(true);
    expect(checkGarage.name).toBe('جراج التحرير');
  });

  test('successfully creates garage when PIN is unique', async () => {
    const result = await firestoreService.createGarage({
      name: 'جراج النصر الجديد',
      phone: '01099999999',
      hourlyRate: 15,
      overnightRate: 50,
      pin: '59281467',
      isTrial: true
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('new_garage_789');
  });

  test('rejects garage creation when PIN is already taken', async () => {
    const result = await firestoreService.createGarage({
      name: 'جراج مكرر',
      phone: '0108888888888',
      hourlyRate: 15,
      overnightRate: 50,
      pin: '11223344',
      isTrial: true
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('رمز الدخول مستخدم بالفعل');
  });
});
