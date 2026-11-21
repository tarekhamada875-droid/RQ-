import { describe, expect, it } from 'vitest';
import { getCairoDateKey as frontendCairoDateKey } from '../domain/garage/businessDay';
import { getCairoDateKey as serverCairoDateKey } from '../../server/projections';

/**
 * Cairo business-day parity contract (rhythm-audit fix, 2026-11-21).
 *
 * The Cairo day key exists twice — once for the frontend
 * (src/domain/garage/businessDay.ts, used by dashboards and forms) and once
 * for the Worker (server/projections.ts, used by every money/report route).
 * Both were hand-maintained copies of the same rule. This test pins them
 * together across ordinary days, the Cairo midnight boundary, and the
 * Egypt DST transitions (clock jumps +2 → +3 in late April and back in
 * late October). If either copy is edited, the build fails until both
 * agree again — one canonical business rule, enforced by machine.
 */

const SAMPLES: Date[] = [
  new Date('2026-01-15T00:00:00Z'),
  new Date('2026-01-15T21:59:59Z'), // still Jan 15 in Cairo (UTC+2)
  new Date('2026-01-15T22:00:00Z'), // already Jan 16 in Cairo
  new Date('2026-04-24T20:59:59Z'), // Egypt DST window opens late April
  new Date('2026-04-24T21:00:01Z'),
  new Date('2026-07-15T20:30:00Z'), // DST period: Cairo midnight at 21:00Z
  new Date('2026-10-29T20:59:59Z'), // DST window closes late October
  new Date('2026-10-29T21:00:01Z'),
  new Date('2026-10-29T23:30:00Z'),
  new Date('2026-11-21T12:34:56Z'),
];

describe('Cairo business-day parity (frontend businessDay vs server projections)', () => {
  it('both implementations agree on the Cairo date key for every sampled instant', () => {
    for (const instant of SAMPLES) {
      expect(frontendCairoDateKey(instant)).toBe(serverCairoDateKey(instant));
    }
  });

  it('follows the Cairo day boundary, not UTC (winter UTC+2)', () => {
    expect(frontendCairoDateKey(new Date('2026-01-15T22:00:00Z'))).toBe('2026-01-16');
    expect(serverCairoDateKey(new Date('2026-01-15T22:00:00Z'))).toBe('2026-01-16');
  });

  it('formats to the YYYY-MM-DD shape both sides store', () => {
    expect(frontendCairoDateKey(new Date('2026-11-21T12:34:56Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(serverCairoDateKey(new Date('2026-11-21T12:34:56Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
