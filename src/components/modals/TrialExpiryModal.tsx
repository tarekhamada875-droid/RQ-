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
  const [isDismissed, setIsDismissed] = useState(false);
  const [showConfirmDeclined, setShowConfirmDeclined] = useState(false);
  const [submittedChoice, setSubmittedChoice] = useState<'continued' | 'declined' | null>(null);

  if (!garage || isDismissed) return null;

  // 1. Only actual trial garages should ever see the Trial Expiry Survey Modal
  if (garage.isTrial !== true) {
    return null;
  }

  // 2. Check if subscription/trial is expired and no decision has been recorded yet
  const isExpired = isSubscriptionExpired(garage);
  const localDecision = typeof window !== 'undefined' && garage.id ? localStorage.getItem(`trial_decision_${garage.id}`) : null;
  const hasDecision = !!garage.trialDecision || !!localDecision;

  // Only show modal if expired and no decision made yet, unless submitted in current session
  if ((!isExpired || hasDecision) && !submittedChoice) {
    return null;
  }

  const handleDecision = async (decision: 'continued' | 'declined') => {
    if (!garage.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await adminService.updateTrialDecision(garage.id, decision);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`trial_decision_${garage.id}`, decision);
      }
      garage.trialDecision = decision;

      setSubmittedChoice(decision);
      if (decision === 'continued') {
        showToast?.('تم إرسال طلبك بنجاح! سيتواصل معك فريقنا فوراً لإتمام التجديد.', 'success');
      } else {
        showToast?.('تم تسجيل اختيارك بنجاح.', 'info');
      }

      setTimeout(() => {
        setIsDismissed(true);
        onClose?.();
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
            <div className="space-y-6 py-2 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center shrink-0 border border-red-500/20 shadow-inner">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-black text-white">تأكيد إلغاء الخدمة</h3>
              </div>

              <div className="space-y-1 max-w-sm mx-auto px-2">
                <p className="font-bold text-red-400 text-sm">هل أنت متأكد من عدم الاستمرار؟</p>
                <p className="text-xs text-slate-400">سيتم إيقاف الخدمة وحذف حساب الجراج بنهاية اليوم.</p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmDeclined(false)}
                  className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-all duration-200 cursor-pointer"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('declined')}
                  className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 cursor-pointer"
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
            <div className="space-y-6 py-2 text-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="space-y-1 mt-1">
                  <h3 className="text-xl font-black text-white">انتهت الفترة التجريبية للجراج</h3>
                  <span className="inline-block px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-xs font-bold font-mono">
                    {garage.name}
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-300 font-medium leading-relaxed max-w-sm mx-auto px-2">
                يرجى تحديد موقفك لتجديد الاشتراك واختيار الباقة المناسبة لجراجك.
              </p>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDecision('continued')}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 text-white font-black text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  <span>نعم، أرغب في الاستمرار والتجديد</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowConfirmDeclined(true)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 active:scale-[0.98] disabled:opacity-50 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 border border-slate-700/50 cursor-pointer"
                >
                  <XCircle className="w-4 h-4 text-slate-400" />
                  <span>لا، لا أرغب في الاستمرار</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
