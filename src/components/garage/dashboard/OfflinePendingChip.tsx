import React from 'react';
import { CloudOff, AlertTriangle } from 'lucide-react';
import { formatArabicDigits } from '../../../utils/plates';

interface OfflinePendingChipProps {
  pending: number;
  rejected: number;
}

/**
 * OFFLINE STEP 2: the drawer's tick light on the garage dashboard.
 *
 * Gray/amber chip = envelopes waiting in the drawer (gray tick: on the
 * phone, not yet at the bank). When the line returns they flush
 * automatically and the chip disappears. Rejected envelopes (the bank
 * refused — e.g. credits ran out before the envelope landed) surface in
 * red so nothing is ever silently dropped.
 */
export const OfflinePendingChip: React.FC<OfflinePendingChipProps> = ({ pending, rejected }) => {
  if (pending <= 0 && rejected <= 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="offline-pending-chip">
      {pending > 0 && (
        <div
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400"
          role="status"
        >
          <CloudOff className="w-4 h-4 shrink-0" />
          <span className="text-xs font-black">
            <span className="font-mono">{formatArabicDigits(pending)}</span>
            {' '}عمليات معلقة على الموبايل — هتتبعت للسيرفر أول ما النت يرجع
          </span>
        </div>
      )}
      {rejected > 0 && (
        <div
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-black">
            <span className="font-mono">{formatArabicDigits(rejected)}</span>
            {' '}عملية اترفضت من السيرفر — راجع الإدارة
          </span>
        </div>
      )}
    </div>
  );
};
