import { describe, expect, it } from 'vitest';
import { selectFirebaseConfig } from './firebaseConfigSelector';

describe('selectFirebaseConfig', () => {
  const production = { projectId: 'production-project' };
  const preview = { projectId: 'rq-hono-preview-isolated' };

  it('selects the isolated Firebase config for an explicit preview target', () => {
    expect(selectFirebaseConfig('preview', production, preview)).toBe(preview);
  });

  it('defaults to the production config for missing or unexpected targets', () => {
    expect(selectFirebaseConfig(undefined, production, preview)).toBe(production);
    expect(selectFirebaseConfig('production', production, preview)).toBe(production);
    expect(selectFirebaseConfig('unknown', production, preview)).toBe(production);
  });
});
