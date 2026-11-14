import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

/**
 * NetworkStatusBanner
 *
 * Slim RTL strip shown at the top of the app when `!isOnline`. Two flavors:
 *
 * - Garage view (offline-first per docs/OFFLINE-MODE-PLAN.md §5 Step 1):
 *   reassuring message — "saved on device, will sync automatically".
 *   Garages no longer hit the full-screen red wall when internet drops;
 *   they see this banner on top of their cached data instead.
 *
 * - All other views (admin / delegate / login): existing "operations
 *   paused" message. Admin and delegate keep today's behavior — they
 *   still hit the full OfflineView wall after the 2s grace period in
 *   useOnlineStatus, exactly as before this Step.
 *
 * Step 1 of the offline-mode build. See docs/OFFLINE-MODE-PLAN.md §5.
 */

interface NetworkStatusBannerProps {
  /**
   * Current app view (the literal `view` string from useLocalStorageState:
   * 'login' | 'garage' | 'admin_login' | 'admin_dashboard' | …).
   * The banner picks its offline message based on whether this equals
   * 'garage'. Undefined defaults to the conservative "operations paused"
   * text, matching today's behavior for any caller that forgets to pass it.
   */
  view?: string;
}

const GARAGE_OFFLINE_MESSAGE =
  'لا يوجد إنترنت — كل شيء محفوظ على الجهاز وسيتحدث تلقائياً';
const DEFAULT_OFFLINE_MESSAGE =
  'انقطع الاتصال بالإنترنت. تم إيقاف العمليات مؤقتاً لحماية البيانات ومنع التكرار.';

function pickOfflineMessage(view: string | undefined): string {
  if (view === 'garage') return GARAGE_OFFLINE_MESSAGE;
  return DEFAULT_OFFLINE_MESSAGE;
}

export const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({
  view,
}) => {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  const message = pickOfflineMessage(view);

  // NOTE: Step 1 of the offline-mode plan only changes the banner's text
  // per role. The visual style (red, sticky, with the WifiOff icon) stays
  // byte-identical to today's banner — no redesign per OFFLINE-MODE-PLAN.md
  // §9 Rule #3 ("no redesign, no scope additions, no improvements").
  return (
    <div
      id="network-status-banner"
      role="alert"
      aria-live="assertive"
      className="w-full bg-red-600 text-white text-center py-2.5 px-4 font-bold text-sm flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md "
    >
      <WifiOff className="w-4 h-4 text-white" />
      <span className="h-2 w-2 rounded-full bg-white" />
      <span>{message}</span>
    </div>
  );
};
