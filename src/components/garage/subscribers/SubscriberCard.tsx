import { memo } from 'react';
import { User, Phone, CalendarDays, Clock, RefreshCw, Edit, Trash2, AlertTriangle } from 'lucide-react';
import type { Subscriber } from '../../../types';
import { EgyptianPlate } from '../../ui/EgyptianPlate';
import { IconButton } from '../../ui/IconButton';
import type { SubscriberStatus } from '../SubscribersView';

interface SubscriberCardProps {
  subscriber: Subscriber;
  status: SubscriberStatus;
  onRenew: (subscriber: Subscriber) => void;
  onEdit: (subscriber: Subscriber) => void;
  onDelete: (id: string) => void;
}

/**
 * Single subscriber row in the list. Extracted from SubscribersView so that
 * each card has its own React.memo boundary — editing one subscriber's form
 * state no longer re-renders every card in the list.
 *
 * The `status` object is computed by the parent (via getStatus) and passed in
 * so this component stays pure and doesn't duplicate the day-diff logic.
 */
export const SubscriberCard = memo(
  ({ subscriber, status, onRenew, onEdit, onDelete }: SubscriberCardProps) => {
    return (
      <div
        className={`bg-[#faf9f6] dark:bg-slate-900 rounded-2xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden ${
          status.isAlert
            ? 'border-red-500/90 dark:border-red-500/70 shadow-[0_4px_20px_rgba(239,68,68,0.12)] bg-red-50/5 dark:bg-red-950/5 pt-6 pb-4 px-4'
            : 'border-slate-200 dark:border-slate-800 p-4'
        }`}
      >
        {status.isAlert && (
          <div
            className="absolute top-0 left-0 right-0 h-1.5 z-10"
            style={{
              backgroundImage: status.isExpired
                ? 'repeating-linear-gradient(-45deg, #ef4444, #ef4444 8px, #1e293b 8px, #1e293b 16px)'
                : 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 8px, #1e293b 8px, #1e293b 16px)',
            }}
          />
        )}

        {status.isAlert && status.alertMessage && (
          <div className="w-full pb-2 mb-2 border-b border-red-200/60 dark:border-red-900/60 flex items-center justify-between gap-2 text-xs font-bold text-red-600 dark:text-red-400">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{status.alertMessage}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4">
            <div className="w-[110px] shrink-0">
              <EgyptianPlate plateNumber={subscriber.plateNumber} size="sm" className="!w-full" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <span>{subscriber.ownerName}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Phone className="w-3.5 h-3.5" />
                <span dir="ltr">{subscriber.phone}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1 items-start md:items-end p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>
                  اشترك من: <span className="font-black text-slate-900 dark:text-slate-100">{subscriber.startDate}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>
                  ينتهي في: <span className="font-black text-slate-900 dark:text-slate-100">{subscriber.endDate}</span>
                </span>
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${status.color}`}>
              {status.label}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onRenew(subscriber)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all outline-none h-8 shadow-sm active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>تجديد الاشتراك</span>
              </button>
              <IconButton
                type="button"
                onClick={() => onEdit(subscriber)}
                aria-label={`تعديل بيانات المشترك ${subscriber.ownerName || subscriber.plateNumber || subscriber.phone}`}
                title="تعديل البيانات"
                className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-colors outline-none h-8 w-8 justify-center"
              >
                <Edit className="w-4 h-4" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => onDelete(subscriber.id)}
                aria-label={`حذف اشتراك ${subscriber.ownerName || subscriber.plateNumber || subscriber.phone}`}
                title="حذف نهائياً"
                className="px-2.5 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors outline-none h-8"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">حذف نهائياً</span>
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
