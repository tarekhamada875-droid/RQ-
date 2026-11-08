import { useState, useEffect, useCallback } from 'react';
import type { ActivityLog } from '../types';
import { safeDate } from '../utils/dates';
import { soundManager } from '../utils/sounds';
import { adminService } from '../services';

interface UseCreditGrantNotificationArgs {
  garageId: string | undefined;
  isAuthenticated: boolean;
  /**
   * Server-stamped timestamp of the most recent credit-grant activity_log
   * (mirrored onto the garage doc by the Worker). Drives the badge trigger
   * — replacing the previous always-on `subscribeToCreditGrantLogs(limit:1)`
   * listener. The garage doc is already subscribed for carsInside/credits,
   * so this scalar arrives for free.
   */
  lastCreditGrantAt?: ActivityLog['timestamp'];
  /** Used for testability (fake timers control it via the prop). Intentionally
   *  NOT in any effect's deps array — `now` ticks every second from the parent,
   *  and re-running the detection effect on every tick would churn state. */
  now?: Date;
  /** Tracks the trial flag because trial recharges are gated differently on
   *  the backend; the detection effect re-runs when this changes. */
  isTrial?: boolean;
}

interface UseCreditGrantNotificationResult {
  /** Whether there is an unacknowledged credit grant in the last 15 minutes. */
  hasNewCreditGrant: boolean;
  /** The most recent unacknowledged credit grant log, or null. */
  latestCreditGrantLog: ActivityLog | null;
  /** Whether the credit grant notification modal is currently open. */
  isCreditGrantNotificationOpen: boolean;
  /** Acknowledge the current recharge: persists id + timestamp to localStorage
   *  and closes the modal. Called by the notification modal's close button
   *  and by the credit-grant-history overlay's close handler. */
  handleAcknowledgeCreditGrant: () => void;
  /** Clear the new-recharge badge without persisting an ack. Used when the
   *  user opens the credit-grant-history overlay (so the badge stops pulsing)
   *  without acknowledging the specific recharge. */
  clearNewCreditGrantBadge: () => void;
}

/** Detection window: a recharge is "new" if it landed within the last 15
 *  minutes and hasn't been acknowledged. Matches the auto-close timer. */
const CREDIT_GRANT_RECENT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Recharge-notification state machine for the garage dashboard.
 *
 * Refactored (Option 2 — "buzzer on the microwave", 2026-11-08):
 * previously this hook scanned the live `creditGrantLogs` array (always-on
 * Firestore subscription at limit 1) to detect a new credit grant. Now it
 * reads a single scalar — `garage.lastCreditGrantAt` — which the Worker
 * stamps on every credit-grant activity log write. The dedicated
 * `subscribeToCreditGrantLogs` listener is now modal-only (only runs while
 * the credit-grant-history overlay is open).
 *
 * The notification modal's full log details (amount, package, reason, etc.)
 * are fetched on-demand via `adminService.getLatestCreditGrantLog` whenever
 * a new `lastCreditGrantAt` arrives — at most one read per actual credit
 * grant event, instead of one read per second forever.
 *
 * The hook does NOT own the credit-grant-history overlay's open/close state —
 * that stays in the dashboard so the overlay can be opened independently
 * of whether a notification is showing.
 */
export function useCreditGrantNotification({
  garageId,
  isAuthenticated,
  lastCreditGrantAt,
  now,
  isTrial,
}: UseCreditGrantNotificationArgs): UseCreditGrantNotificationResult {
  const [hasNewCreditGrant, setHasNewRecharge] = useState(false);
  const [latestCreditGrantLog, setLatestRechargeLog] = useState<ActivityLog | null>(null);
  const [isCreditGrantNotificationOpen, setIsRechargeNotificationOpen] = useState(false);

  // ── Detection: compare garage.lastCreditGrantAt to the acknowledged
  //    timestamp in localStorage. Triggers on changes to lastCreditGrantAt
  //    (which only happens when the Worker writes a new credit-grant
  //    activity log) — not on every parent re-render.
  useEffect(() => {
    if (!isAuthenticated || !garageId) return;
    if (lastCreditGrantAt === undefined || lastCreditGrantAt === null) {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
      return;
    }

    const logTime = safeDate(lastCreditGrantAt).getTime();
    if (!Number.isFinite(logTime) || logTime <= 0) return;

    const lastAckId = localStorage.getItem(`acknowledged_credit_grant_${garageId}`);
    const lastAckTime = Number(localStorage.getItem(`acknowledged_credit_grant_time_${garageId}`) || 0);
    // Acknowledged if either (a) the ack timestamp is at-or-after the grant
    // (covers all prior recharges) or (b) the legacy ack-id matches (older
    // clients acked by log id).
    const isAcknowledged = (lastAckTime > 0 && logTime <= lastAckTime) || Boolean(lastAckId && lastAckId === String(logTime));

    const diffMs = Math.max(0, (now?.getTime?.() ?? Date.now()) - logTime);
    const isRecent = diffMs < CREDIT_GRANT_RECENT_WINDOW_MS;

    if (!isAcknowledged && isRecent) {
      setHasNewRecharge(true);
      setIsRechargeNotificationOpen(true);
      if (localStorage.getItem(`dashboard_sound_credit_grant_${garageId}`) !== String(logTime)) {
        try {
          soundManager.play("checkIn");
        } catch {
          // Sound playback is best-effort — failures (autoplay policy, missing
          // audio context) are not actionable for the user and already surfaced
          // via the visual credit grant notification. No console leak in production.
        }
        localStorage.setItem(`dashboard_sound_credit_grant_${garageId}`, String(logTime));
      }
    } else {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }
  }, [garageId, isAuthenticated, lastCreditGrantAt, isTrial]);

  // ── On-demand fetch: when the badge fires, fetch the full activity_log
  //    doc once so the notification modal can show amount/package/reason.
  //    This is a one-shot getDocs(limit:1), NOT a continuous listener —
  //    runs only when lastCreditGrantAt actually changes.
  useEffect(() => {
    if (!isAuthenticated || !garageId || !lastCreditGrantAt) return;
    if (!hasNewCreditGrant) return; // only fetch when the badge is active

    let active = true;
    adminService.getLatestCreditGrantLog(garageId).then((log) => {
      if (!active) return;
      if (log) setLatestRechargeLog(log);
    }).catch(() => {
      // Best-effort fetch — if it fails the user still sees the badge and
      // can open the credit-grant-history overlay to see full details.
    });
    return () => { active = false; };
  }, [garageId, isAuthenticated, lastCreditGrantAt, hasNewCreditGrant]);

  // Auto-close the notification 15 minutes after the log timestamp.
  // PERF: `now` is read once when the notification opens (for the initial
  // remainingMs), and the timer runs undisturbed until it fires or the user
  // acknowledges. `now` is NOT in the deps array — including it would
  // clear and re-create the setTimeout every time the parent's clock ticks.
  useEffect(() => {
    if (!isCreditGrantNotificationOpen || !lastCreditGrantAt) return;

    const logTime = safeDate(lastCreditGrantAt).getTime();
    const currentTime = now?.getTime?.() ?? Date.now();
    const remainingMs = Math.max(0, logTime + CREDIT_GRANT_RECENT_WINDOW_MS - currentTime);
    const expiryTimer = window.setTimeout(() => {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }, remainingMs);

    return () => window.clearTimeout(expiryTimer);
  }, [isCreditGrantNotificationOpen, lastCreditGrantAt]);

  const handleAcknowledgeCreditGrant = useCallback(() => {
    if (lastCreditGrantAt && garageId) {
      const logTime = safeDate(lastCreditGrantAt).getTime();
      // Persist both the legacy id-key (now storing the timestamp string,
      // since the activity_log doc id isn't mirrored onto the garage doc)
      // and the time-key so future grants with later timestamps re-fire.
      localStorage.setItem(`acknowledged_credit_grant_${garageId}`, String(logTime));
      if (logTime > 0) {
        localStorage.setItem(`acknowledged_credit_grant_time_${garageId}`, String(logTime));
      }
    }
    setHasNewRecharge(false);
    setIsRechargeNotificationOpen(false);
  }, [garageId, lastCreditGrantAt]);

  const clearNewCreditGrantBadge = useCallback(() => {
    setHasNewRecharge(false);
  }, []);

  return {
    hasNewCreditGrant,
    latestCreditGrantLog,
    isCreditGrantNotificationOpen,
    handleAcknowledgeCreditGrant,
    clearNewCreditGrantBadge,
  };
}
