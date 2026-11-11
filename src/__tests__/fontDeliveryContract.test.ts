import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Font delivery contract (DevTools runtime audit 2026-11-11).
 *
 * The Google Fonts URL in index.html must load exactly the weights the
 * codebase actually renders — never more (each weight is a separate
 * ~30-60 KB download) and never fewer (missing weights trigger synthetic
 * bolding or silent nearest-weight substitution).
 *
 * Family → weight mapping (verified against src):
 * - Inter  (--font-sans, default): 500 (font-medium; regular text also
 *   renders via it), 700 (font-bold; font-semibold/600 resolves here),
 *   800 (font-extrabold), 900 (font-black — used in 51 files).
 * - Outfit (--font-mono): 700 (font-mono font-bold), 900 (font-mono
 *   font-black — plates, FitText inputs).
 * - Amiri  (--font-serif): 700 only — all 4 font-serif usages request
 *   weight >= 600, which CSS resolves to the 700 file; the 400 weight
 *   was never rendered by any view (pruned 2026-11-11).
 */

// Vitest runs from the repo root; jsdom's import.meta.url is not a file: URL,
// so resolve the repo's index.html from the working directory instead.
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const fontUrls = [...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g)].map((m) => m[1]);

function parseWeights(url: string): Map<string, string[]> {
  const weights = new Map<string, string[]>();
  for (const [, family, list] of url.matchAll(/family=([A-Za-z]+):wght@([0-9;]+)/g)) {
    weights.set(family, list.split(';'));
  }
  return weights;
}

describe('font delivery contract', () => {
  it('loads exactly one Google Fonts stylesheet (plus the identical noscript fallback)', () => {
    expect(fontUrls).toHaveLength(2);
    expect(new Set(fontUrls).size).toBe(1);
  });

  it('loads exactly the rendered weights per family — no more, no fewer', () => {
    const weights = parseWeights(fontUrls[0]);

    expect(weights.get('Amiri')).toEqual(['700']);
    expect(weights.get('Inter')).toEqual(['500', '700', '800', '900']);
    expect(weights.get('Outfit')).toEqual(['700', '900']);
    expect(weights.size).toBe(3);
  });

  it('keeps display=swap and the deferred media=print loading strategy', () => {
    expect(fontUrls[0]).toContain('display=swap');
    expect(html).toContain('media="print" onload=');
  });
});
