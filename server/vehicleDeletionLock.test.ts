import { describe, expect, it } from 'vitest';
import { isGarageDeletionActive } from './routes/vehicles';

describe('garage deletion check-in lock', () => {
  it('blocks check-in when isDeleting is true', () => {
    expect(isGarageDeletionActive({ isDeleting: true })).toBe(true);
  });

  it('allows normal garages and does not trust truthy non-boolean values', () => {
    expect(isGarageDeletionActive({ isDeleting: false })).toBe(false);
    expect(isGarageDeletionActive({})).toBe(false);
    expect(isGarageDeletionActive({ isDeleting: 'true' })).toBe(false);
  });
});
