import { describe, expect, it } from 'vitest';
import { canManageDelegates } from './domain/authorization';

describe('delegate mutation authorization', () => {
  it('keeps delegate update/delete admin-only', () => {
    expect(canManageDelegates({ role: 'admin' })).toBe(true);
    expect(canManageDelegates({ role: 'supervisor' })).toBe(false);
  });
});
