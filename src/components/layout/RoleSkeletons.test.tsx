/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  AdminDashboardSkeleton,
  DelegateDashboardSkeleton,
  DestinationScreen,
  GarageDashboardSkeleton,
} from './RoleSkeletons';

// LOADING-UX (2026-11-25, owner initiative "A+B+C"): the gate must show the
// REAL login screen when the user is headed to a login view (it is fully
// static) and the role-matched skeleton when they are returning to a
// dashboard. These tests pin the decision boundaries.

const loginProps = {
  loginPhone: '',
  setLoginPhone: () => {},
  handleGarageLogin: async () => {},
  isLoading: false,
  closeKeyboard: () => {},
};

describe('DestinationScreen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('(A) a login destination renders the REAL login screen — plate + keypad, not a ghost', () => {
    render(<DestinationScreen view="login" loginProps={loginProps} />);
    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0' })).toBeInTheDocument();
    expect(screen.getByText('أدخل الرمز السري...')).toBeInTheDocument();
  });

  it('garage view with nothing stored falls through to the real login screen (redirect destination)', () => {
    render(<DestinationScreen view="garage" loginProps={loginProps} />);
    expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
  });

  it('(B) a returning garage owner gets the garage-shaped skeleton, not the login screen', () => {
    localStorage.setItem('app_garage', '{"id":"g1"}');
    const { container, queryByText } = render(<DestinationScreen view="garage" />);
    // The garage preview mirrors the real dashboard: header pill, the
    // Egyptian plate motif (blue #0057b7 bar) and the gauge circle.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.innerHTML).toContain('0057b7');
    expect(container.innerHTML).toContain('rounded-[1.75rem]');
    expect(queryByText('تسجيل الدخول')).toBeNull();
  });

  it('(B) a returning admin gets the admin-shaped skeleton', () => {
    localStorage.setItem('app_staff', '{"id":"a1"}');
    const { container, queryByText } = render(<DestinationScreen view="admin_dashboard" />);
    expect(container.innerHTML).toContain('max-w-7xl');
    expect(queryByText('تسجيل الدخول')).toBeNull();
  });

  it('(B) a returning delegate gets the delegate-shaped skeleton', () => {
    localStorage.setItem('app_delegate', '{"id":"d1"}');
    const { container, queryByText } = render(<DestinationScreen view="delegate_dashboard" />);
    expect(container.innerHTML).toContain('max-w-4xl');
    expect(container.innerHTML).toContain('amber');
    expect(queryByText('تسجيل الدخول')).toBeNull();
  });
});

describe('role skeletons', () => {
  afterEach(() => {
    cleanup();
  });

  it('all three are static shells marked aria-hidden (no fake interactivity)', () => {
    for (const Skeleton of [GarageDashboardSkeleton, AdminDashboardSkeleton, DelegateDashboardSkeleton]) {
      const { container } = render(<Skeleton />);
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(container.querySelectorAll('button')).toHaveLength(0);
      expect(container.querySelectorAll('input')).toHaveLength(0);
      cleanup();
    }
  });

  it('garage skeleton mirrors the real GarageActiveCountCard: FlipNumber placeholders + amber strip + car icon', () => {
    // SKELETON-FIDELITY (2026-11-25): the previous skeleton had a gray circular
    // gauge here, which previewed the wrong component. The real bottom card is
    // a FlipNumber (dark-navy rounded digit cards) sitting on an amber strip
    // with a Car icon. This test pins the corrected shape so it can't regress.
    const { container } = render(<GarageDashboardSkeleton />);
    const html = container.innerHTML;
    // Two dark-navy flip-card placeholders (mirrors FlipDigit size="lg")
    const flipCardCount = (html.match(/w-20 h-32 rounded-2xl md:w-32 md:h-48/g) || []).length;
    expect(flipCardCount).toBeGreaterThanOrEqual(2);
    // Amber bottom strip with the Car icon (mirrors GarageActiveCountCard)
    expect(html).toContain('#f59e0b');
    expect(html.toLowerCase()).toContain('<svg'); // lucide Car renders as <svg>
    // No mint-green pills anymore (default RegistrationCard state has no buttons)
    expect(html).not.toContain('bg-emerald-500/15');
    expect(html).not.toContain('bg-emerald-500/10');
    // The three outer cards (subscription, registration, active-count) blend
    // into the cream canvas — bg-[#faf9f6] must appear on each of them, plus
    // the container and the header (>= 5 occurrences). The plate frame body
    // inside the registration card legitimately uses bg-white (mirrors the
    // real RegistrationCard), so we don't ban bg-white wholesale.
    const creamCardCount = (html.match(/bg-\[#faf9f6\]/g) || []).length;
    expect(creamCardCount).toBeGreaterThanOrEqual(5);
  });
});
