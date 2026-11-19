import { describe, expect, it } from 'vitest';

// Audit P0-1 (owner-approved plan 2026-11-19): the client module must mirror
// the server source of truth exactly. A one-sided edit to either side fails
// here before it can ship.

import * as serverLimits from './limits';
import * as clientLimits from '../../src/utils/limits';

describe('client limits mirror the server source of truth', () => {
  const serverEntries = Object.entries(serverLimits).filter(([key]) => !key.startsWith('_'));

  it('exports the same constant names as the server module', () => {
    expect(Object.keys(clientLimits).sort()).toEqual(
      Object.keys(serverLimits).sort(),
    );
  });

  it('exports the same values for every limit', () => {
    for (const [key, value] of serverEntries) {
      expect(
        (clientLimits as Record<string, unknown>)[key],
        `client limit ${key} drifted from the server value`,
      ).toBe(value);
    }
  });
});
