import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Clock, 
  Building2, 
  Eye, 
  EyeOff, 
  Send, 
  Loader2 
} from 'lucide-react';
import { Announcement, Garage } from '../../types';
import { firestoreService } from '../../services';
import { safeDate } from '../../utils';
import { useTheme } from '../../utils/ThemeContext';
import { useAdminTranslation } from '../../utils/adminTranslations';

interface AdminAnnouncementsViewProps {
  allGarages: Garage[];
}

export const AdminAnnouncementsView: React.FC<AdminAnnouncementsViewProps> = ({
  allGarages
}) => {
  const { adminLang } = useTheme();
  const t = useAdminTranslation(adminLang);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [target, setTarget] = useState<'all' | 'specific'>('all');
  const [targetGarageId, setTargetGarageId] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const unsubscribe = firestoreService.onAnnouncementsChange((list) => {
      setAnnouncements(list);
      setIsLoading(false);
      clearTimeout(timeout);
    });

    timeout = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    if (!title.trim() || !content.trim()) {
      setFormFeedback({ type: 'error', text: t('يرجى ملء عنوان ونص الإعلان') });
      return;
    }

    if (target === 'specific' && !targetGarageId) {
      setFormFeedback({ type: 'error', text: t('يرجى اختيار الجراج المستهدف') });
      return;
    }

    const selectedGarage = targetGarageId ? allGarages.find(g => g.id === targetGarageId) : null;

    setIsSubmitting(true);
    try {
      await firestoreService.createAnnouncement({
        title: title.trim(),
        content: content.trim(),
        target,
        targetGarageId: target === 'specific' ? targetGarageId : null,
        targetGarageName: target === 'specific' ? (selectedGarage?.name || null) : null,
        priority,
        isActive: true,
        authorName: 'الإدارة العامة'
      });

      setTitle('');
      setContent('');
      setTarget('all');
      setTargetGarageId('');
      setPriority('normal');
      setFormFeedback({ type: 'success', text: t('تم نشر الإعلان بنجاح') });
      setTimeout(() => setFormFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      setFormFeedback({ type: 'error', text: t('فشل نشر الإعلان') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (actionLoadingId) return;
    setActionLoadingId(`delete-${id}`);
    try {
      await firestoreService.deleteAnnouncement(id);
    } catch (err) {
      console.error('Failed to delete announcement:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleActive = async (ann: Announcement) => {
    if (actionLoadingId) return;
    setActionLoadingId(`toggle-${ann.id}`);
    try {
      await firestoreService.toggleAnnouncementActive(ann.id, !ann.isActive);
    } catch (err) {
      console.error('Failed to toggle announcement active state:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Create Announcement Form */}
        <section className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>{t('نشر إعلان جديد')}</span>
            </h3>

            <form onSubmit={handleCreateAnnouncement} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('عنوان الإعلان')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('مثال: تحديث مواعيد العمل أو صيانة النظام')}
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  {t('نص الإعلان والتفاصيل')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('اكتب نص الإعلان الذي سيظهر لمديري الجراجات...')}
                  required
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                    {t('الهدف')}
                  </label>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value as 'all' | 'specific')}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">{t('كل الجراجات (عام)')}</option>
                    <option value="specific">{t('جراج محدد')}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                    {t('مستوى الأهمية')}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'important' | 'urgent')}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="normal">{t('عادي (أزرق)')}</option>
                    <option value="important">{t('هام (برتقالي)')}</option>
                    <option value="urgent">{t('عاجل (أحمر)')}</option>
                  </select>
                </div>
              </div>

              {target === 'specific' && (
                <div className="space-y-1.5 animate-in fade-in duration-150">
                  <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                    {t('اختر الجراج المستهدف')} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={targetGarageId}
                    onChange={(e) => setTargetGarageId(e.target.value)}
                    required
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">{t('اختر الجراج...')}</option>
                    {allGarages.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.phone || 'بدون هاتف'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formFeedback && (
                <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                  formFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
                }`}>
                  <span>{formFeedback.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 mt-4 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('جاري النشر...')}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{t('نشر الإعلان فوراً')}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* Right Column: Announcements List */}
        <section className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-emerald-500" />
                <span>{t('سجل الإعلانات الحالية')}</span>
              </h3>
              <span className="text-xs font-bold text-slate-400 font-mono">
                {announcements.length} {t('إعلان مسجل')}
              </span>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-slate-400 font-bold flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <span>{t('جاري تحميل الإعلانات...')}</span>
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold">
                <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>{t('لا توجد إعلانات منشورة حالياً')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => {
                  const createdAtDate = ann.createdAt ? safeDate(ann.createdAt) : new Date();
                  const isUrgent = ann.priority === 'urgent';
                  const isImportant = ann.priority === 'important';

                  return (
                    <div
                      key={ann.id}
                      className={`p-5 rounded-2xl border-2 transition-all ${
                        !ann.isActive
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 opacity-60'
                          : isUrgent
                          ? 'border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20'
                          : isImportant
                          ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20'
                          : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="font-black text-slate-900 dark:text-white text-base">
                              {ann.title}
                            </h4>
                            {isUrgent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white">
                                {t('عاجل')}
                              </span>
                            )}
                            {isImportant && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                                {t('هام')}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              ann.isActive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {ann.isActive ? t('نشط ويظهر للجراجات') : t('معطل/مخفي')}
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed mt-2">
                            {ann.content}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={!!actionLoadingId}
                            onClick={() => handleToggleActive(ann)}
                            title={ann.isActive ? t('إخفاء') : t('تفعيل')}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoadingId === `toggle-${ann.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                            ) : ann.isActive ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={!!actionLoadingId}
                            onClick={() => handleDeleteAnnouncement(ann.id)}
                            title={t('حذف')}
                            className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                          >
                            {actionLoadingId === `delete-${ann.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-[11px] font-bold text-slate-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>
                              {ann.target === 'all'
                                ? t('كل الجراجات')
                                : `${t('جراج')}: ${ann.targetGarageName || ann.targetGarageId}`}
                            </span>
                          </span>
                        </div>

                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {createdAtDate.toLocaleDateString(adminLang === 'en' ? 'en-US' : 'ar-EG', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminAnnouncementsView;
