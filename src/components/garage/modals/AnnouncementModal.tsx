import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X as XIcon } from 'lucide-react';
import { Announcement } from '../../../types';

interface AnnouncementModalProps {
  announcement: Announcement | null;
  onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  announcement,
  onClose
}) => {
  return (
    <AnimatePresence>
      {announcement && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-700 bg-[#faf9f6] dark:bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-amber-600 dark:text-amber-400">إعلان مهم</p>
                <h2 id="announcement-modal-title" className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">
                  {announcement.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="إغلاق الإعلان"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-200">
              {announcement.content}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-2xl bg-slate-900 dark:bg-amber-400 text-amber-400 dark:text-slate-950 font-black"
            >
              فهمت
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
