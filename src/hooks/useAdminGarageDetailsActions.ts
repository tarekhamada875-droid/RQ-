import { useState, useEffect, useCallback } from 'react';
import { firestoreService } from '../services';
import { normalizeDigits, canChangeGarageRates, generateSafePin } from '../utils';
import type { Garage, Staff } from '../types';
import { useAppStore } from '../store/appStore';

export function getGaragePinUpdateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'PIN_ALREADY_TAKEN' || message === 'الرمز مستخدم بالفعل') {
    return 'الرمز مستخدم بالفعل';
  }
  if (message && /[\u0600-\u06FF]/.test(message)) return message;
  return 'تعذر تحديث رمز دخول الجراج. يرجى المحاولة مرة أخرى.';
}

interface UseAdminGarageDetailsActionsArgs {
  garage: Garage;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  staffList: Staff[];
  setStaffList: React.Dispatch<React.SetStateAction<Staff[]>>;
  isLoading: boolean;
  setIsLoading: (b: boolean) => void;
  onRefreshAdminLists?: () => Promise<void>;
}

interface UseAdminGarageDetailsActionsResult {
  // Rates
  hourlyRateInput: string;
  setHourlyRateInput: (v: string) => void;
  overnightRateInput: string;
  setOvernightRateInput: (v: string) => void;
  isSavingRates: boolean;
  hasRateChanges: boolean;
  rateCheck: ReturnType<typeof canChangeGarageRates>;
  handleSaveRates: () => Promise<void>;
  // Lock
  isUpdatingLock: boolean;
  handleToggleLock: () => Promise<void>;
  // Monthly subscribers
  handleToggleMonthlySubscribers: () => Promise<void>;
  // Garage PIN
  garagePinInput: string;
  setGaragePinInput: (v: string) => void;
  isUpdatingGaragePin: boolean;
  pinError: string;
  setPinError: (v: string) => void;
  handleSaveGaragePin: (e: React.FormEvent) => Promise<void>;
  // Staff
  handleAddStaffSubmit: (e: React.FormEvent, staffForm: { name: string; pin: string }, resetForm: () => void, closeModal: () => void) => Promise<void>;
  handleDeleteStaff: (staffId: string) => Promise<void>;
  generateNewStaffPin: () => string;
}

/**
 * Action handlers + business state for AdminGarageDetailsView.
 *
 * Extracted from the 415-line god component. Owns:
 *   - rate editing state + save handler
 *   - lock/suspend toggle
 *   - monthly-subscribers toggle
 *   - garage PIN edit state + save handler
 *   - staff add/delete handlers
 *
 * The view component keeps pure UI toggle state (modal visibility, form
 * drafts, menu, accordion) and the inline staff-PIN editing state (which
 * is purely visual — the actual updateStaff call lives in
 * AdminGarageSettingsSection).
 */
export function useAdminGarageDetailsActions({
  garage,
  setSelectedGarageForDetails,
  staffList,
  setStaffList,
  isLoading,
  setIsLoading,
  onRefreshAdminLists,
}: UseAdminGarageDetailsActionsArgs): UseAdminGarageDetailsActionsResult {
  // ── Rates ────────────────────────────────────────────────────────────
  const [hourlyRateInput, setHourlyRateInput] = useState<string>(String(garage.hourlyRate || 0));
  const [overnightRateInput, setOvernightRateInput] = useState<string>(String(garage.overnightRate || 0));
  const [isSavingRates, setIsSavingRates] = useState(false);

  useEffect(() => {
    setHourlyRateInput(String(garage.hourlyRate || 0));
    setOvernightRateInput(String(garage.overnightRate || 0));
  }, [garage.id, garage.hourlyRate, garage.overnightRate]);

  const hasRateChanges =
    hourlyRateInput !== String(garage.hourlyRate || 0) ||
    overnightRateInput !== String(garage.overnightRate || 0);

  const rateCheck = canChangeGarageRates(garage);

  const refreshAdminListsAfterMutation = async () => {
    try {
      await onRefreshAdminLists?.();
    } catch (error) {
      console.error('Failed to refresh Admin lists after garage update:', error);
    }
  };

  const handleSaveRates = async () => {
    if (!rateCheck.allowed) return;

    const hourly = Number(normalizeDigits(hourlyRateInput));
    const overnight = Number(normalizeDigits(overnightRateInput));

    if (isNaN(hourly) || isNaN(overnight)) return;

    setIsSavingRates(true);
    try {
      const now = new Date();
      await firestoreService.updateGarage(garage.id, {
        hourlyRate: hourly,
        overnightRate: overnight,
        lastRateChangeDate: now,
      });
      await refreshAdminListsAfterMutation();
      setSelectedGarageForDetails({
        ...garage,
        hourlyRate: hourly,
        overnightRate: overnight,
        lastRateChangeDate: now,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingRates(false);
    }
  };

  // ── Lock / Suspend ───────────────────────────────────────────────────
  const [isUpdatingLock, setIsUpdatingLock] = useState(false);

  const handleToggleLock = async () => {
    if (isUpdatingLock) return;
    setIsUpdatingLock(true);
    try {
      const newLocked = !garage.isLocked;
      await firestoreService.updateGarage(garage.id, {
        isLocked: newLocked,
        isSuspended: newLocked
      });
      await refreshAdminListsAfterMutation();
      setSelectedGarageForDetails({
        ...garage,
        isLocked: newLocked,
        isSuspended: newLocked
      });
    } catch (err) {
      console.error('Failed to toggle garage lock:', err);
    } finally {
      setIsUpdatingLock(false);
    }
  };

  // ── Monthly subscribers toggle ───────────────────────────────────────
  const handleToggleMonthlySubscribers = async () => {
    const newState = !garage.hasMonthlySubscribers;
    try {
      await firestoreService.updateGarage(garage.id, { hasMonthlySubscribers: newState });
      await refreshAdminListsAfterMutation();
      setSelectedGarageForDetails({ ...garage, hasMonthlySubscribers: newState });
    } catch (e) {
      console.error(e);
    }
  };

  // ── Garage PIN ───────────────────────────────────────────────────────
  const [garagePinInput, setGaragePinInput] = useState(garage.pin || '');
  const [isUpdatingGaragePin, setIsUpdatingGaragePin] = useState(false);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    setGaragePinInput(garage.pin || '');
  }, [garage.id, garage.pin]);

  const handleSaveGaragePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{5}$/.test(garagePinInput)) {
      setPinError('يجب أن يكون الرمز 5 أرقام بالضبط');
      return;
    }
    setIsUpdatingGaragePin(true);
    setPinError('');
    try {
      const pinCheck = await firestoreService.isPinTaken(garagePinInput, garage.id);
      if (pinCheck.taken) {
        setPinError(`الرمز مستخدم بالفعل لدى (${pinCheck.name})`);
        setIsUpdatingGaragePin(false);
        return;
      }
      await firestoreService.updateGarage(garage.id, { pin: garagePinInput, ownerPin: garagePinInput });
      await refreshAdminListsAfterMutation();
      setSelectedGarageForDetails({ ...garage, pin: garagePinInput, ownerPin: garagePinInput });
    } catch (err: unknown) {
      setPinError(getGaragePinUpdateErrorMessage(err));
    } finally {
      setIsUpdatingGaragePin(false);
    }
  };

  // ── Staff add / delete ───────────────────────────────────────────────
  const handleAddStaffSubmit = async (
    e: React.FormEvent,
    staffForm: { name: string; pin: string },
    resetForm: () => void,
    closeModal: () => void,
  ) => {
    e.preventDefault();
    const name = staffForm.name.trim();
    if (!name || !staffForm.pin) return;
    setIsLoading(true);
    try {
      const pinCheck = await firestoreService.isPinTaken(staffForm.pin);
      if (pinCheck.taken) {
        const { showToast } = useAppStore.getState();
        showToast?.('الرمز مستخدم بالفعل', 'error');
        return;
      }
      const staffData: Omit<Staff, 'id'> = {
        name,
        pin: staffForm.pin,
        garageId: garage.id,
        role: 'staff'
      };
      const created = await firestoreService.addStaff(staffData);
      if (!created?.id) throw new Error('STAFF_CREATE_MISSING_ID');
      setStaffList((current) => [
        ...current.filter((staff) => staff.id !== created.id),
        { ...staffData, id: created.id },
      ]);
      resetForm();
      closeModal();
    } catch (error) {
      console.error('Failed to add Staff.');
      const { showToast } = useAppStore.getState();
      const message = error instanceof Error ? error.message : '';
      const pinAlreadyTaken = message === 'الرمز مستخدم بالفعل' || message === 'PIN_ALREADY_TAKEN';
      showToast?.(
        pinAlreadyTaken ? 'الرمز مستخدم بالفعل' : 'تعذر إضافة الموظف. يرجى المحاولة مرة أخرى.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await firestoreService.removeStaff(staffId);
      setStaffList((current) => current.filter((staff) => staff.id !== staffId));
    } catch {
      console.error('Failed to delete Staff.');
      const { showToast } = useAppStore.getState();
      showToast?.('تعذر حذف الموظف. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewStaffPin = useCallback(() => {
    return generateSafePin(staffList.map((staff) => staff.pin));
  }, [staffList]);

  return {
    hourlyRateInput,
    setHourlyRateInput,
    overnightRateInput,
    setOvernightRateInput,
    isSavingRates,
    hasRateChanges,
    rateCheck,
    handleSaveRates,
    isUpdatingLock,
    handleToggleLock,
    handleToggleMonthlySubscribers,
    garagePinInput,
    setGaragePinInput,
    isUpdatingGaragePin,
    pinError,
    setPinError,
    handleSaveGaragePin,
    handleAddStaffSubmit,
    handleDeleteStaff,
    generateNewStaffPin,
  };
}
