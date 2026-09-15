import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, HeartHandshake } from 'lucide-react';
import { Garage } from '../../types';
import { isSubscriptionExpired } from '../../domain/garage/subscription';
import { adminService } from '../../services/adminService';

interface TrialExpiryModalProps {
  garage: Garage | null;
  onClose?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const TrialExpiryModal: React.FC<TrialExpiryModalProps> = ({
  garage,
  onClose,
  showToast
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDeclined, setShowConfirmDeclined] = useState(false);
  const [submittedChoice, setSubmittedChoice] = useState<'continued' | 'declined' | null>(null);

  if (!garage) return null;

  // Check if subscription/trial is expired and no decision has been recorded yet
  const isExpired = isSubscriptionExpired(garage);
  const hasDecision = !!garage.trialDecision;

  // Only show modal if expired and no decision made yet, unless submitted in current session
  if (!isExpired || hasDecision) {
    return null;
  }

  const handleDecision = async (decision: 'continued' | 'declined') => {
    if (!garage.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await adminService.updateTrialDecision(garage.id, decision);

      setSubmittedChoice(decision);
      if (decision === 'continued') {
        showToast?.('تم إرسال طلبك بنجاح! سيتواصل معك فريقنا فوراً لإتمام التجديد.', 'success');
      } else {
        showToast?.('تم تسجيل اختيارك بنجاح.', 'info');
      }

      setTimeout(() => {
        if (onClose) onClose();
      }, 2500);
    } catch (err) {
      console.error('Error saving trial decision:', err);
      showToast?.('حدث خطأ أثناء حفظ اختيارك، يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-white text-right font-sans dir-rtl"
          onClick={(e) => e.stopPropagation()}
        >
          {submittedChoice ? (
            <div className="py-8 text-center space-y-4">
              {submittedChoice === 'continued' ? (
                <>
                  <div className="w-16 h-16 mx-auto bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                    <HeartHandshake className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-400">شُكراً لثقتك بنا! ❤️</h3>
                  <p className="text-slate-300 text-sm leading-relaxed max-w-sm mx-auto">
                    تم استلام طلب التجديد بنجاح! سيتواصل معك موظف المبيعات فوراً لتفعيل الباقة المناسبة لجراجك.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-amber-400">تم تسجيل اختيارك</h3>
                  <p className="text-slate-300 text-sm leading-relaxed max-w-sm mx-auto">
                    نتمنى لك كل التوفيق، ويسعدنا دائماً خدمتك في أي وقت لاحق.
                  </p>
                </>
              )}
            </div>
          ) : showConfirmDeclined ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-red-400 border-b border-slate-800 pb-3">
                <AlertTriangle className="w-7 h-7 shrink-0" />
                <h3 className="text-lg font-bold">تأكيد إلغاء الخدمة</h3>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-slate-200 text-sm leading-relaxed">
                <p className="font-semibold text-red-300 mb-1">هل أنت متأكد من عدم الاستمرار؟</p>
                <p>سيتم إيقاف الخدمة وحذف حساب الجراج بنهاية اليوم.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmDeclined(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-all duration-200"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('declined')}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-sm transition-all duration-200 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  تأكيد عدم الاستمرار
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">انتهت الفترة التجريبية للجراج</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{garage.name}</p>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-slate-200 text-sm leading-relaxed">
                لقد انتهت الفترة التجريبية الخاصة بجراجك. يرجى تحديد موقفك للتجديد لتحديد الباقة المناسبة لك.
              </div>

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('continued')}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  نعم، أرغب في الاستمرار والتجديد
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmDeclined(true)}
                  className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-slate-300 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 border border-slate-700/50"
                >
                  <XCircle className="w-4 h-4 text-slate-400" />
                  لا، لا أرغب في الاستمرار
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
