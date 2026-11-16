import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FitText } from './FitText';

/**
 * jsdom has no layout engine — clientWidth/scrollWidth are always 0, so
 * FitText's fitting path never runs in ordinary component tests. These tests
 * stub the layout reads:
 *
 *   - every element reports clientWidth 200
 *   - scrollWidth is 30px per character at the natural 40px font size, and
 *     scales down proportionally with any fitted inline font size (like real
 *     glyph metrics)
 *   - getComputedStyle always reports the 40px class-level font size
 *
 * That is enough to exercise the real fit math, including the regression
 * behind the owner report (2026-11-16, "the 3 letters drift into the number
 * side"): the fit used to reuse a natural-width cache measured once at the
 * first character, so by the 3rd character the (now wider) text was never
 * shrunk and the RTL plate half spilled its letters across the divider into
 * the numbers half. With the old cache the second assertion of the first
 * test fails — the font size never reacts to the text growing.
 */

const HOST_WIDTH = 200;
const PX_PER_CHAR = 30;
const NATURAL_FONT_SIZE = '40px';
const NATURAL_SIZE_PX = 40;

// Captured at module load, before the mocks below are installed.
const originalClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
const originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');

beforeAll(() => {
  // jsdom doesn't implement ResizeObserver; other component tests stub it
  // the same way. FitText only ever observes its container.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: Element) { return HOST_WIDTH; },
  });
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: Element) {
      const chars = (this.textContent ?? '').length;
      const naturalWidth = chars * PX_PER_CHAR;
      const inlineSize = this instanceof HTMLElement && this.style.fontSize
        ? Number.parseFloat(this.style.fontSize)
        : NATURAL_SIZE_PX;
      return Math.round(naturalWidth * (inlineSize / NATURAL_SIZE_PX));
    },
  });
  vi.stubGlobal('getComputedStyle', () => ({ fontSize: NATURAL_FONT_SIZE }));
});

afterAll(() => {
  if (originalClientWidth) Object.defineProperty(Element.prototype, 'clientWidth', originalClientWidth);
  else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
  if (originalScrollWidth) Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
  else delete (Element.prototype as unknown as Record<string, unknown>).scrollWidth;
  vi.unstubAllGlobals();
});

const renderFit = (text: string) => render(
  <div data-testid="fit-host">
    <FitText minFontSize={14} className="text-6xl font-black" style={{ fontSize: NATURAL_FONT_SIZE }}>
      {text}
    </FitText>
  </div>
);

const rerenderFit = (
  rerender: (ui: React.ReactElement) => void,
  text: string
) => rerender(
  <div data-testid="fit-host">
    <FitText minFontSize={14} className="text-6xl font-black" style={{ fontSize: NATURAL_FONT_SIZE }}>
      {text}
    </FitText>
  </div>
);

describe('FitText', () => {
  it('shrinks the font as soon as the text outgrows the container (3-letter plate drift regression)', () => {
    // 1 char → 30px ≤ 200px: natural size, no fitted override.
    const { container, rerender } = renderFit('س');
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.fontSize).toBe(NATURAL_FONT_SIZE);

    // 7 chars → 210px at the natural size > 200px: the fit MUST react to the
    // new, wider text. Regression: the stale per-key width cache concluded
    // "still fits" and never shrank here.
    rerenderFit(rerender, 'سصطعفقل');
    // 40 × 200 / 210 = 38.09… → floored to 38
    expect(span.style.fontSize).toBe('38px');
  });

  it('removes the fitted size again once backspacing makes the text fit', () => {
    const { container, rerender } = renderFit('سصطعفقل');
    const span = container.querySelector('span') as HTMLElement;
    // Mount converges: 40 → 38 (fitted); at 38px the text renders 199.5px —
    // inside the 200px host — so the fit settles at exactly 38.
    expect(span.style.fontSize).toBe('38px');

    // Backspace down to 5 chars → 150px at the natural size ≤ 200px: the
    // natural class size fits again, so the fitted override must be dropped
    // entirely.
    rerenderFit(rerender, 'سصطع');
    expect(span.style.fontSize).toBe(NATURAL_FONT_SIZE);
  });

  it('never shrinks below minFontSize even for extreme overflow', () => {
    // 40 chars → 1200px at the natural size > 200px. The pure ratio would be
    // 40 × 200 / 1200 = 6.7px, but the floor is minFontSize = 14px.
    const { container } = renderFit('س'.repeat(40));
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.fontSize).toBe('14px');
  });
});
