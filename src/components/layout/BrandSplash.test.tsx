/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { BrandSplash } from './BrandSplash';

// NO-SKELETONS (owner decision, 2026-11-25): every skeleton screen is removed
// from the app. The brand splash is the ONLY full-page waiting screen. These
// tests pin what it is (the plate motif + أرق footer) and what it is NOT
// (no ghost blocks, no spinner, no "جاري التحميل..." text, no interactivity).

describe('BrandSplash', () => {
  afterEach(() => cleanup());

  it('renders the brand motif: Egyptian plate frame + أرق footer', () => {
    const { container, getByText } = render(<BrandSplash />);
    expect(container.innerHTML).toContain('0057b7'); // plate header strip
    expect(getByText('أرق لتطوير البرمجيات')).toBeInTheDocument();
  });

  it('is NOT a skeleton: no spinner, no loading text, no ghost blocks, no interactivity', () => {
    const { container, queryByText } = render(<BrandSplash />);
    const html = container.innerHTML;
    // No skeleton ghost blocks (the removed PageSkeleton / role skeletons used these)
    expect(html).not.toContain('bg-slate-200/');
    expect(html).not.toContain('bg-slate-800/');
    // No loading noise
    expect(queryByText('جاري التحميل...')).toBeNull();
    expect(queryByText('جاري تحميل البيانات...')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
    // Static shell: nothing interactive
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });
});
