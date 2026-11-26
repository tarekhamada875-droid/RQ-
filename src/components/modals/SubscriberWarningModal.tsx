import React, { memo } from 'react';
import { AlertCircle } from 'lucide-react';
import { EgyptianPlate } from '../ui/EgyptianPlate';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface SubscriberWarningModalProps {
  plateNumber: string;
  onConfirm: () => void;
}

/**
 * Monthly-subscriber warning (audit F-19, Phase 4c). Now a single-button
 * ConfirmDialog: backdrop tap, Escape and the button all acknowledge via
 * `onConfirm` (unchanged), and the plate preview rides in the dialog's
 * children slot.
 */
export const SubscriberWarningModal: React.FC<SubscriberWarningModalProps> = memo(({
  plateNumber,
  onConfirm
}) => (
  <ConfirmDialog
    isOpen
    tone="success"
    title="تنبيه: مشترك شهري"
    message={
      <>
        رقم اللوحة بتاع مشترك شهري شغال وفعّال دلوقتي.
        <br />
        <span className="text-emerald-600 dark:text-emerald-400 font-black">مش هيتسجل</span> في قائمة العربيات اللي جوّه.
      </>
    }
    icon={<AlertCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />}
    confirmText="تمام"
    onConfirm={onConfirm}
    zIndex="z-[110]"
  >
    {/* Plate mockup — the dialog's reason to exist */}
    <div className="flex items-center justify-center mb-2 text-center shrink-0">
      <EgyptianPlate plateNumber={plateNumber} size="md" />
    </div>
  </ConfirmDialog>
));
