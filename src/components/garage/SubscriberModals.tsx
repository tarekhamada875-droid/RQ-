import React from 'react';
import type { Subscriber } from '../../types';
import { SubscriberAddEditModal, type SubscriberDuration } from './modals/SubscriberAddEditModal';
import { SubscriberDeleteConfirmModal } from './modals/SubscriberDeleteConfirmModal';
import { SubscriberRenewModal, type SubscriberRenewType } from './modals/SubscriberRenewModal';

/**
 * SubscriberModals — thin router.
 *
 * Previously this file was 426 lines and bundled three modals together
 * (Add/Edit, Delete confirm, Renew) sharing one 24-prop interface. Stage 3
 * of the structural refactor split each modal into its own file under
 * `./modals/` with its own focused props.
 *
 * This file re-exports the union shape so existing callers
 * (SubscribersView.tsx) keep working without changes. Each modal's
 * visibility is computed from the relevant prop (showAddModal /
 * subscriberToDelete / showRenewModal + activeSubscriberForRenew).
 *
 * Re-exports the duration / renew types so callers that imported them
 * from this module's surface still resolve.
 */

// Re-export for any external importer that previously did:
//   import { Duration } from './SubscriberModals'
// The new home is the Add/Edit modal file.
export type Duration = SubscriberDuration;
export type RenewType = SubscriberRenewType;

interface SubscriberModalsProps {
  // Add/Edit modal
  showAddModal: boolean;
  setShowAddModal: (v: boolean) => void;
  editingSubscriber: Subscriber | null;
  plateNumber: string;
  setPlateNumber: (v: string) => void;
  ownerName: string;
  setOwnerName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  startDate: string;
  endDate: string;
  selectedDuration: Duration;
  setSelectedDuration: (v: Duration) => void;
  isPlateFocused: boolean;
  setIsPlateFocused: (v: boolean) => void;
  handleVirtualKeyPress: (key: string) => void;
  plateContainerRef: React.RefObject<HTMLDivElement | null>;
  keypadContainerRef: React.RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  // Delete confirmation
  subscriberToDelete: string | null;
  setSubscriberToDelete: (v: string | null) => void;
  confirmDelete: () => void;
  // Renew
  showRenewModal: boolean;
  setShowRenewModal: (v: boolean) => void;
  activeSubscriberForRenew: Subscriber | null;
  setActiveSubscriberForRenew: (v: Subscriber | null) => void;
  handleConfirmRenew: (type: RenewType) => void;
  formatDisplayDate: (dateStr: string) => string;
}

export const SubscriberModals = ({
  showAddModal,
  setShowAddModal,
  editingSubscriber,
  plateNumber,
  setPlateNumber,
  ownerName,
  setOwnerName,
  phone,
  setPhone,
  startDate,
  endDate,
  selectedDuration,
  setSelectedDuration,
  isPlateFocused,
  setIsPlateFocused,
  handleVirtualKeyPress,
  plateContainerRef,
  keypadContainerRef,
  isSubmitting,
  handleSubmit,
  subscriberToDelete,
  setSubscriberToDelete,
  confirmDelete,
  showRenewModal,
  setShowRenewModal,
  activeSubscriberForRenew,
  setActiveSubscriberForRenew,
  handleConfirmRenew,
  formatDisplayDate,
}: SubscriberModalsProps) => {
  return (
    <>
      <SubscriberAddEditModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        editingSubscriber={editingSubscriber}
        plateNumber={plateNumber}
        setPlateNumber={setPlateNumber}
        ownerName={ownerName}
        setOwnerName={setOwnerName}
        phone={phone}
        setPhone={setPhone}
        startDate={startDate}
        endDate={endDate}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        isPlateFocused={isPlateFocused}
        setIsPlateFocused={setIsPlateFocused}
        handleVirtualKeyPress={handleVirtualKeyPress}
        plateContainerRef={plateContainerRef}
        keypadContainerRef={keypadContainerRef}
        isSubmitting={isSubmitting}
        handleSubmit={handleSubmit}
        formatDisplayDate={formatDisplayDate}
      />

      <SubscriberDeleteConfirmModal
        isOpen={subscriberToDelete !== null}
        onCancel={() => setSubscriberToDelete(null)}
        onConfirm={confirmDelete}
      />

      <SubscriberRenewModal
        isOpen={showRenewModal}
        subscriber={activeSubscriberForRenew}
        onClose={() => {
          setShowRenewModal(false);
          setActiveSubscriberForRenew(null);
        }}
        onConfirm={handleConfirmRenew}
        isSubmitting={isSubmitting}
      />
    </>
  );
};
