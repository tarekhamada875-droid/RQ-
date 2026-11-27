/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { memo, useCallback } from 'react';
import {
  Loader2,
  Key,
  RefreshCw
} from 'lucide-react';
import { normalizeDigits } from '../../../utils/plates';
import { Garage } from '../../../types';
import { FastInput } from '../../ui/FastInput';
import { ModalShell } from '../../ui/ModalShell';

interface AdminGarageModalsProps {
  garage: Garage;
  // Edit Owner PIN Modal
  showEditGaragePinModal: boolean;
  setShowEditGaragePinModal: (val: boolean) => void;
  /** Generates a fresh safe PIN suggestion into the input (owner request 2026-11-19). */
  onRegeneratePin: () => void;
  garagePinInput: string;
  setGaragePinInput: (pin: string) => void;
  pinError: string;
  setPinError: (err: string) => void;
  isUpdatingGaragePin: boolean;
  onSaveGaragePin: (e: React.FormEvent) => Promise<void>;
}

export const AdminGarageModals = memo(({
  garage,
  showEditGaragePinModal,
  setShowEditGaragePinModal,
  onRegeneratePin,
  garagePinInput,
  setGaragePinInput,
  pinError,
  setPinError,
  isUpdatingGaragePin,
  onSaveGaragePin
}: AdminGarageModalsProps) => {
  // Close handler stays stable across renders so ModalShell re-arms its
  // Escape/focus handling with the same callback each open.
  const closeEditPin = useCallback(() => setShowEditGaragePinModal(false), [setShowEditGaragePinModal]);

  return (
    <>
      {/* Edit Owner PIN Modal */}
      {showEditGaragePinModal && (
        <ModalShell onClose={closeEditPin} zIndex="z-50" panelClassName="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 text-right">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 dark:border-emerald-900/60">
            <Key className="w-6 h-6 stroke-[2.5]" />
          </div>

          <h3 className="text-lg font-black text-slate-900 dark:text-white text-center mb-1">
            {'تعديل رمز المالك'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center font-bold mb-6">
            {garage.name}
          </p>

          <form onSubmit={onSaveGaragePin}>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                  {'رمز الدخول الجديد (5 أرقام):'}
                </label>
                <FastInput
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  minLength={5}
                  maxLength={5}
                  defaultValue={garagePinInput}
                  onCommit={(v) => {
                    setGaragePinInput(normalizeDigits(v).replace(/\D/g, '').slice(0, 5));
                    setPinError('');
                  }}
                  onLiveValue={(v) => {
                    setGaragePinInput(normalizeDigits(v).replace(/\D/g, '').slice(0, 5));
                    setPinError('');
                  }}
                  mask={(v) => normalizeDigits(v).replace(/\D/g, '').slice(0, 5)}
                  placeholder="••••"
                  autoFocus
                  className="w-full text-center text-xl font-mono font-black tracking-widest py-3 px-4 bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 focus:border-emerald-500 dark:focus:border-emerald-500 rounded-2xl text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {pinError && (
                  <p className="text-xs font-bold text-rose-500 text-center mt-2 ">
                    {pinError}
                  </p>
                )}
              </div>

              {/* Generator row (owner request 2026-11-19): the modal is
                  connected to the PIN generator — one tap replaces the
                  field with a fresh safe suggestion. Typing stays possible;
                  active + previously-used PINs are refused at save. */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onRegeneratePin}
                  disabled={isUpdatingGaragePin}
                  className="flex items-center gap-1.5 text-[11px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 px-3 py-1.5 rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{'توليد رمز آخر'}</span>
                </button>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
                  {'الرمز المولّد غير مستخدم. يمكنك أيضًا كتابة رمز من اختيارك — سيُرفض تلقائيًا إن كان مستخدمًا من قبل.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isUpdatingGaragePin || !/^\d{5}$/.test(garagePinInput)}
                className="flex-1 h-12 bg-emerald-600 text-white rounded-2xl font-black text-xs sm:text-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer "
              >
                {isUpdatingGaragePin ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{'جاري الحفظ...'}</span>
                  </>
                ) : (
                  <span>{'حفظ الرمز'}</span>
                )}
              </button>
              <button
                type="button"
                disabled={isUpdatingGaragePin}
                onClick={() => setShowEditGaragePinModal(false)}
                className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black text-xs sm:text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center"
              >
                {'إلغاء'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
});
