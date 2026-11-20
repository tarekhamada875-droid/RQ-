import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Font delivery contract (perf optimization 2026-11-20: self-hosted fonts).
 *
 * Previously the app loaded Google Fonts via a cross-origin <link> to
 * fonts.googleapis.com, which cost a DNS+TLS round-trip on every cold boot
 * (80ms on good networks, 1-2s on 2G). The fonts are now self-hosted at
 * /fonts/*.woff2 with a local @font-face CSS at /fonts/fonts.css — same
 * Cloudflare Pages origin as the rest of the app, served over the already-
 * warm HTTP/3 connection.
 *
 * This test pins the new contract:
 *   1. No Google Fonts <link> or preconnect remains in index.html.
 *   2. The local /fonts/fonts.css is loaded synchronously (no media=print
 *      hack — same-origin CSS is tiny and first paint should render with
 *      the right font immediately).
 *   3. The font files exist on disk in public/fonts/.
 *   4. The @font-face declarations cover the weights the codebase renders:
 *      Amiri 700, Inter 500/700/800/900 (variable font), Outfit 700/900
 *      (variable font).
 */

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const fontsCss = readFileSync(join(process.cwd(), 'public', 'fonts', 'fonts.css'), 'utf8');

describe('font delivery contract (self-hosted, 2026-11-20)', () => {
  it('has no Google Fonts <link> or <preconnect> in index.html', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('loads the local /fonts/fonts.css synchronously (no media=print defer hack)', () => {
    // Synchronous same-origin CSS — first paint renders with the right font.
    expect(html).toContain('<link rel="stylesheet" href="/fonts/fonts.css"');
    // The old deferred-load strategy is no longer needed for same-origin CSS.
    expect(html).not.toContain('media="print" onload=');
  });

  it('ships the font files in public/fonts/', () => {
    const fontsDir = join(process.cwd(), 'public', 'fonts');
    expect(existsSync(join(fontsDir, 'amiri-700-arabic.woff2'))).toBe(true);
    expect(existsSync(join(fontsDir, 'amiri-700-latin.woff2'))).toBe(true);
    // Inter is a variable font — one file covers weights 100-900.
    expect(existsSync(join(fontsDir, 'inter-latin.woff2'))).toBe(true);
    // Outfit is a variable font — one file covers weights 100-900.
    expect(existsSync(join(fontsDir, 'outfit-latin.woff2'))).toBe(true);
  });

  it('declares @font-face for Amiri 700 (arabic + latin subsets)', () => {
    // Amiri 700 with the Arabic subset (primary use) AND the Latin subset
    // (for Latin chars appearing in an Amiri context). The unicode-range
    // split lets the browser fetch only the subset it actually needs.
    const amiriMatches = [...fontsCss.matchAll(/font-family:\s*'Amiri'[^}]+src:\s*url\('\/fonts\/amiri-700-(arabic|latin)\.woff2'\)[^}]+/g)];
    expect(amiriMatches.length).toBe(2);
    const subsetNames = amiriMatches.map((m) => m[1]).sort();
    expect(subsetNames).toEqual(['arabic', 'latin']);
  });

  it('declares @font-face for Inter as a variable font covering weights 100-900', () => {
    // Inter is a variable font — one file covers all weights 100-900.
    // The app uses 500 (font-medium), 700 (font-bold), 800 (font-extrabold),
    // 900 (font-black). The font-weight range syntax (100 900) tells the
    // browser this is a variable font.
    expect(fontsCss).toMatch(/font-family:\s*'Inter'[^}]+font-weight:\s*100\s+900[^}]+src:\s*url\('\/fonts\/inter-latin\.woff2'\)/);
  });

  it('declares @font-face for Outfit as a variable font covering weights 100-900', () => {
    // Outfit is a variable font — one file covers all weights 100-900.
    // The app uses 700 (font-mono font-bold) and 900 (font-mono font-black —
    // plates, FitText inputs).
    expect(fontsCss).toMatch(/font-family:\s*'Outfit'[^}]+font-weight:\s*100\s+900[^}]+src:\s*url\('\/fonts\/outfit-latin\.woff2'\)/);
  });

  it('keeps font-display: swap on every @font-face (no FOIT, brief FOUT)', () => {
    // display=swap means the browser renders text immediately with a
    // fallback font, then swaps to the real font when it arrives. This
    // matches the previous Google Fonts display=swap behavior.
    // Count actual @font-face declarations (not the word in comments).
    const fontFaceCount = (fontsCss.match(/^@font-face\s*\{/gm) || []).length;
    const swapCount = (fontsCss.match(/font-display:\s*swap/g) || []).length;
    expect(fontFaceCount).toBe(4); // Amiri arabic, Amiri latin, Inter, Outfit
    expect(swapCount).toBe(fontFaceCount);
  });
});
