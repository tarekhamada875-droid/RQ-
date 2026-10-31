import { useState, useEffect, useCallback } from 'react';
import type { ActivityLog } from '../types';
import { safeDate } from '../utils';
import { soundManager } from '../utils/sounds';

interface UseRechargeNotificationArgs {
  garageId: string | undefined;
  isAuthenticated: boolean;
  rechargeLogs: ActivityLog[];
  /** Used for testability (fake timers control it via the prop). Intentionally
   *  NOT in any effect's deps array — `now` ticks every second from the parent,
   *  and re-running the detection effect on every tick would churn state. */
  now?: Date;
  /** Tracks the trial flag because trial recharges are gated differently on
   *  the backend; the detection effect re-runs when this changes. */
  isTrial?: boolean;
}

interface UseRechargeNotificationResult {
  /** Whether there is an unacknowledged recharge in the last 15 minutes. */
  hasNewRecharge: boolean;
  /** The most recent unacknowledged recharge log, or null. */
  latestRechargeLog: ActivityLog | null;
  /** Whether the recharge notification modal is currently open. */
  isRechargeNotificationOpen: boolean;
  /** Acknowledge the current recharge: persists id + timestamp to localStorage
   *  and closes the modal. Called by the notification modal's close button
   *  and by the recharge-history overlay's close handler. */
  handleAcknowledgeRecharge: () => void;
  /** Clear the new-recharge badge without persisting an ack. Used when the
   *  user opens the recharge-history overlay (so the badge stops pulsing)
   *  without acknowledging the specific recharge. */
  clearNewRechargeBadge: () => void;
}

/** Detection window: a recharge is "new" if it landed within the last 15
 *  minutes and hasn't been acknowledged. Matches the auto-close timer. */
const RECHARGE_RECENT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Recharge-notification state machine for the garage dashboard.
 *
 * Extracted from GarageDashboardView (was ~85 lines inline). Owns:
 *   - detection of an unacknowledged recent recharge from the live feed
 *   - one-shot sound playback per recharge id
 *   - 15-minute auto-close timer keyed off the log timestamp
 *   - localStorage-backed acknowledgement (id + timestamp, so older
 *     recharges don't re-notify if the id changes shape)
 *
 * The hook does NOT own the recharge-history overlay's open/close state —
 * that stays in the dashboard so the overlay can be opened independently
 * of whether a notification is showing.
 */
export function useRechargeNotification({
  garageId,
  isAuthenticated,
  rechargeLogs,
  now,
  isTrial,
}: UseRechargeNotificationArgs): UseRechargeNotificationResult {
  const [hasNewRecharge, setHasNewRecharge] = useState(false);
  const [latestRechargeLog, setLatestRechargeLog] = useState<ActivityLog | null>(null);
  const [isRechargeNotificationOpen, setIsRechargeNotificationOpen] = useState(false);

  // Detection: scan the live recharge feed for an unacknowledged entry from
  // the last 15 minutes. Filters out referral-reward entries (those aren't
  // "you got money" notifications). `now` is read for testability but is
  // intentionally NOT in the deps array — every parent tick would re-run
  // this effect and churn the state setters.
  useEffect(() => {
    if (!isAuthenticated || !garageId) return;
    const candidateLogs = (rechargeLogs || []).filter((log: any) => {
      if (!log) return false;
      if (log.details?.type === 'use_referral_reward') return false;
      if (log.plateNumber && String(log.plateNumber).includes('استخدام مكافأة')) return false;
      return true;
    });

    const lastAckId = localStorage.getItem(`acknowledged_recharge_${garageId}`);
    const lastAckTime = Number(localStorage.getItem(`acknowledged_recharge_time_${garageId}`) || 0);
    const latest = candidateLogs[0];
    if (!latest) {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
      return;
    }

    const logDate = safeDate(latest?.timestamp);
    const logTime = logDate.getTime();
    const logId = latest?.id ?? `recharge_${logTime}`;
    const diffMs = Math.max(0, (now?.getTime?.() ?? Date.now()) - logTime);
    const isRecent = diffMs < RECHARGE_RECENT_WINDOW_MS;
    const isAcknowledged = lastAckId === logId || (lastAckTime > 0 && logTime <= lastAckTime);

    if (!isAcknowledged && isRecent) {
      setHasNewRecharge(true);
      setLatestRechargeLog(latest);
      setIsRechargeNotificationOpen(true);
      if (localStorage.getItem(`dashboard_sound_recharge_${garageId}`) !== logId) {
        try {
          soundManager.play("checkIn");
        } catch {
          // Sound playback is best-effort — failures (autoplay policy, missing
          // audio context) are not actionable for the user and already surfaced
          // via the visual recharge notification. No console leak in production.
        }
        localStorage.setItem(`dashboard_sound_recharge_${garageId}`, logId);
      }
    } else {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }
  }, [garageId, isAuthenticated, rechargeLogs, isTrial, now]);

  // Auto-close the notification 15 minutes after the log timestamp.
  // PERF: `now` is read once when the notification opens (for the initial
  // remainingMs), and the timer runs undisturbed until it fires or the user
  // acknowledges. `now` is still read from the prop for testability.
  useEffect(() => {
    if (!isRechargeNotificationOpen || !latestRechargeLog) return;

    const logTime = safeDate(latestRechargeLog.timestamp).getTime();
    const currentTime = now?.getTime?.() ?? Date.now();
    const remainingMs = Math.max(0, logTime + RECHARGE_RECENT_WINDOW_MS - currentTime);
    const expiryTimer = window.setTimeout(() => {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }, remainingMs);

    return () => window.clearTimeout(expiryTimer);
  }, [isRechargeNotificationOpen, latestRechargeLog, now]);

  const handleAcknowledgeRecharge = useCallback(() => {
    if (latestRechargeLog && garageId) {
      localStorage.setItem(`acknowledged_recharge_${garageId}`, latestRechargeLog.id);
      const logTime = safeDate(latestRechargeLog.timestamp).getTime();
      if (logTime > 0) {
        localStorage.setItem(`acknowledged_recharge_time_${garageId}`, String(logTime));
      }
    }
    setHasNewRecharge(false);
    setIsRechargeNotificationOpen(false);
  }, [garageId, latestRechargeLog]);

  const clearNewRechargeBadge = useCallback(() => {
    setHasNewRecharge(false);
  }, []);

  return {
    hasNewRecharge,
    latestRechargeLog,
    isRechargeNotificationOpen,
    handleAcknowledgeRecharge,
    clearNewRechargeBadge,
  };
}
