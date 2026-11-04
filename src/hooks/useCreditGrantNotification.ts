import { useState, useEffect, useCallback } from 'react';
import type { ActivityLog } from '../types';
import { safeDate } from '../utils';
import { soundManager } from '../utils/sounds';

interface UseCreditGrantNotificationArgs {
  garageId: string | undefined;
  isAuthenticated: boolean;
  creditGrantLogs: ActivityLog[];
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
 * Extracted from GarageDashboardView (was ~85 lines inline). Owns:
 *   - detection of an unacknowledged recent credit grant from the live feed
 *   - one-shot sound playback per recharge id
 *   - 15-minute auto-close timer keyed off the log timestamp
 *   - localStorage-backed acknowledgement (id + timestamp, so older
 *     recharges don't re-notify if the id changes shape)
 *
 * The hook does NOT own the credit-grant-history overlay's open/close state —
 * that stays in the dashboard so the overlay can be opened independently
 * of whether a notification is showing.
 */
export function useCreditGrantNotification({
  garageId,
  isAuthenticated,
  creditGrantLogs,
  now,
  isTrial,
}: UseCreditGrantNotificationArgs): UseCreditGrantNotificationResult {
  const [hasNewCreditGrant, setHasNewRecharge] = useState(false);
  const [latestCreditGrantLog, setLatestRechargeLog] = useState<ActivityLog | null>(null);
  const [isCreditGrantNotificationOpen, setIsRechargeNotificationOpen] = useState(false);

  // Detection: scan the live credit grant feed for an unacknowledged entry from
  // the last 15 minutes. Filters out referral-reward entries (those aren't
  // "you got money" notifications). `now` is read for testability but is
  // intentionally NOT in the deps array — every parent tick would re-run
  // this effect and churn the state setters.
  useEffect(() => {
    if (!isAuthenticated || !garageId) return;
    const candidateLogs = (creditGrantLogs || []).filter((log: any) => {
      if (!log) return false;
      if (log.details?.type === 'use_referral_reward') return false;
      if (log.plateNumber && String(log.plateNumber).includes('استخدام مكافأة')) return false;
      return true;
    });

    const lastAckId = localStorage.getItem(`acknowledged_credit_grant_${garageId}`);
    const lastAckTime = Number(localStorage.getItem(`acknowledged_credit_grant_time_${garageId}`) || 0);
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
    const isRecent = diffMs < CREDIT_GRANT_RECENT_WINDOW_MS;
    const isAcknowledged = lastAckId === logId || (lastAckTime > 0 && logTime <= lastAckTime);

    if (!isAcknowledged && isRecent) {
      setHasNewRecharge(true);
      setLatestRechargeLog(latest);
      setIsRechargeNotificationOpen(true);
      if (localStorage.getItem(`dashboard_sound_credit_grant_${garageId}`) !== logId) {
        try {
          soundManager.play("checkIn");
        } catch {
          // Sound playback is best-effort — failures (autoplay policy, missing
          // audio context) are not actionable for the user and already surfaced
          // via the visual credit grant notification. No console leak in production.
        }
        localStorage.setItem(`dashboard_sound_credit_grant_${garageId}`, logId);
      }
    } else {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }
  }, [garageId, isAuthenticated, creditGrantLogs, isTrial]);

  // Auto-close the notification 15 minutes after the log timestamp.
  // PERF: `now` is read once when the notification opens (for the initial
  // remainingMs), and the timer runs undisturbed until it fires or the user
  // acknowledges. `now` is NOT in the deps array — including it would
  // clear and re-create the setTimeout every time the parent's clock ticks.
  useEffect(() => {
    if (!isCreditGrantNotificationOpen || !latestCreditGrantLog) return;

    const logTime = safeDate(latestCreditGrantLog.timestamp).getTime();
    const currentTime = now?.getTime?.() ?? Date.now();
    const remainingMs = Math.max(0, logTime + CREDIT_GRANT_RECENT_WINDOW_MS - currentTime);
    const expiryTimer = window.setTimeout(() => {
      setHasNewRecharge(false);
      setLatestRechargeLog(null);
      setIsRechargeNotificationOpen(false);
    }, remainingMs);

    return () => window.clearTimeout(expiryTimer);
  }, [isCreditGrantNotificationOpen, latestCreditGrantLog]);

  const handleAcknowledgeCreditGrant = useCallback(() => {
    if (latestCreditGrantLog && garageId) {
      localStorage.setItem(`acknowledged_credit_grant_${garageId}`, latestCreditGrantLog.id);
      const logTime = safeDate(latestCreditGrantLog.timestamp).getTime();
      if (logTime > 0) {
        localStorage.setItem(`acknowledged_credit_grant_time_${garageId}`, String(logTime));
      }
    }
    setHasNewRecharge(false);
    setIsRechargeNotificationOpen(false);
  }, [garageId, latestCreditGrantLog]);

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
