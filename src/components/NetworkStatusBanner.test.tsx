import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NetworkStatusBanner } from './NetworkStatusBanner';

/**
 * Regression tests for Offline Mode Step 1 (docs/OFFLINE-MODE-PLAN.md §5).
 *
 * The banner must:
 *   - render nothing when online (regardless of view)
 *   - for the garage view: show the reassuring "saved on device" message
 *     (this is the new behavior introduced by Step 1 — garages no longer
 *     hit the full-screen wall, they see this banner instead)
 *   - for admin / delegate / login / undefined: keep the existing
 *     "operations paused" message byte-identical to today's banner
 *
 * The wall-vs-banner gate itself (App.tsx line that skips `<OfflineView />`
 * for the garage view) is a one-liner not worth a separate component test;
 * the meaningful behavior change lives in the banner's role-aware message.
 */

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

import { useOnlineStatus } from '../hooks/useOnlineStatus';

const mockUseOnlineStatus = (isOnline: boolean) => {
  (useOnlineStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    isOnline,
    showOfflineScreen: !isOnline,
  });
};

describe('NetworkStatusBanner — Offline Mode Step 1', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders nothing when online, regardless of view', () => {
    mockUseOnlineStatus(true);
    const { container } = render(<NetworkStatusBanner view="garage" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the garage offline message ("saved on device, will sync") for the garage view when offline', () => {
    mockUseOnlineStatus(false);
    render(<NetworkStatusBanner view="garage" />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain(
      'لا يوجد إنترنت — كل شيء محفوظ على الجهاز وسيتحدث تلقائياً',
    );
    // Must NOT show the old "operations paused" text in garage view.
    expect(banner.textContent).not.toContain('تم إيقاف العمليات');
  });

  it('keeps the existing "operations paused" message for admin views', () => {
    mockUseOnlineStatus(false);
    render(<NetworkStatusBanner view="admin_dashboard" />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain(
      'انقطع الاتصال بالإنترنت. تم إيقاف العمليات مؤقتاً لحماية البيانات ومنع التكرار.',
    );
    // Must NOT show the new garage offline text.
    expect(banner.textContent).not.toContain('محفوظ على الجهاز');
  });

  it('keeps the existing "operations paused" message for delegate views', () => {
    mockUseOnlineStatus(false);
    render(<NetworkStatusBanner view="delegate_dashboard" />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('تم إيقاف العمليات');
  });

  it('keeps the existing "operations paused" message for login views', () => {
    mockUseOnlineStatus(false);
    render(<NetworkStatusBanner view="login" />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('تم إيقاف العمليات');
  });

  it('falls back to the conservative "operations paused" message when no view is passed', () => {
    mockUseOnlineStatus(false);
    // Simulate a caller that forgot to pass view (defensive default).
    render(<NetworkStatusBanner />);
    const banner = screen.getByRole('alert');
    expect(banner.textContent).toContain('تم إيقاف العمليات');
  });

  it('keeps the red visual style for the garage view — no redesign per plan §9 Rule #3', () => {
    mockUseOnlineStatus(false);
    render(<NetworkStatusBanner view="garage" />);
    const banner = screen.getByRole('alert');
    // The existing banner uses bg-red-600. Step 1 must not change this —
    // only the text changes. If this assertion ever fails, someone (likely
    // a future AI) added an unauthorized visual redesign.
    expect(banner.className).toContain('bg-red-600');
    expect(banner.className).not.toContain('bg-amber');
    expect(banner.className).not.toContain('bg-emerald');
  });
});
