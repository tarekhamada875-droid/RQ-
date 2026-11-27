import { useState, useEffect, useCallback } from 'react';
import { authService, garageService } from '../services';
import { normalizeDigits } from '../utils/plates';
import { canChangeGarageRates } from '../utils/businessRules';
import { useAsyncAction } from './useAsyncAction';
import { generateSafePin, isHashedPin } from '../utils/pins';
import { getGaragePinUpdateErrorMessage, PIN_UPDATE_ERROR_MESSAGES } from '../utils/domainErrors';
import type { Garage } from '../types';

interface UseAdminGarageDetailsActionsArgs {
  garage: Garage;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  isLoading: boolean;
  setIsLoading: (b: boolean) => void;
  onRefreshAdminLists?: () => Promise<void>;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
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
  /** @param alsoExclude keeps the suggestion from matching what's already in the field. */
  generateNewGaragePin: (alsoExclude?: string) => string;
}

/**
 * Action handlers + business state for AdminGarageDetailsView.
 *
 * Extracted from the 415-line god component. Owns:
 *   - rate editing state + save handler
 *   - lock/suspend toggle
 *   - monthly-subscribers toggle
 *   - garage PIN edit state + save handler
 */
export function useAdminGarageDetailsActions({
  garage,
  setSelectedGarageForDetails,
  isLoading: _isLoading,
  setIsLoading: _setIsLoading,
  onRefreshAdminLists,
  showToast: _showToast,
}: UseAdminGarageDetailsActionsArgs): UseAdminGarageDetailsActionsResult {
  // ── Rates ────────────────────────────────────────────────────────────
  const [hourlyRateInput, setHourlyRateInput] = useState<string>(String(garage.hourlyRate || 0));
  const [overnightRateInput, setOvernightRateInput] = useState<string>(String(garage.overnightRate || 0));
  const { isLoading: isSavingRates, run: runSaveRates } = useAsyncAction();

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

    await runSaveRates(async () => {
      const now = new Date();
      await garageService.updateGarage(garage.id, {
        hourlyRate: hourly,
        overnightRate: overnight,
        lastRateChangeDate: now,
      });
      setSelectedGarageForDetails({
        ...garage,
        hourlyRate: hourly,
        overnightRate: overnight,
        lastRateChangeDate: now,
      });
      void refreshAdminListsAfterMutation();
    });
  };

  // ── Lock / Suspend ───────────────────────────────────────────────────
  const { isLoading: isUpdatingLock, run: runToggleLock } = useAsyncAction();

  const handleToggleLock = async () => {
    if (isUpdatingLock) return;
    await runToggleLock(async () => {
      const newLocked = !garage.isLocked;
      await garageService.updateGarage(garage.id, {
        isLocked: newLocked,
        isSuspended: newLocked
      });
      setSelectedGarageForDetails({
        ...garage,
        isLocked: newLocked,
        isSuspended: newLocked
      });
      void refreshAdminListsAfterMutation();
    }, (err) => console.error('Failed to toggle garage lock:', err));
  };

  // ── Monthly subscribers toggle ───────────────────────────────────────
  const handleToggleMonthlySubscribers = async () => {
    const newState = !garage.hasMonthlySubscribers;
    try {
      await garageService.updateGarage(garage.id, { hasMonthlySubscribers: newState });
      setSelectedGarageForDetails({ ...garage, hasMonthlySubscribers: newState });
      void refreshAdminListsAfterMutation();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Garage PIN ───────────────────────────────────────────────────────
  const [garagePinInput, setGaragePinInput] = useState(garage.pin || '');
  const { isLoading: isUpdatingGaragePin, run: runGaragePinUpdate } = useAsyncAction();
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
    setPinError('');
    await runGaragePinUpdate(async () => {
      const pinCheck = await authService.isPinTaken(garagePinInput, garage.id);
      if (pinCheck.taken) {
        // The availability endpoint distinguishes an ACTIVE holder (name it,
        // so the admin knows who owns the collision) from a RETIRED one
        // (used once in the past — permanently blocked by the server).
        setPinError(pinCheck.roleKey === 'retired'
          ? PIN_UPDATE_ERROR_MESSAGES.PIN_PREVIOUSLY_USED
          : `الرمز مستخدم بالفعل لدى (${pinCheck.name})`);
        return;
      }
      await garageService.updateGarage(garage.id, { pin: garagePinInput, ownerPin: garagePinInput });
      setSelectedGarageForDetails({ ...garage, pin: garagePinInput, ownerPin: garagePinInput });
      void refreshAdminListsAfterMutation();
    }, (err: unknown) => {
      setPinError(getGaragePinUpdateErrorMessage(err));
    });
  };

  // Owner-PIN generator (owner request 2026-11-19): the edit modal opens
  // with a generated suggestion instead of asking the admin to invent one.
  // Same crypto-safe generator; excludes the garage's own current (plaintext)
  // PIN so the suggestion is always a change. Global uniqueness (active +
  // retired PINs) stays enforced by the server at save time.
  const generateNewGaragePin = useCallback((alsoExclude?: string) => {
    const excluded = new Set<string>();
    if (garage.pin && !isHashedPin(garage.pin)) excluded.add(garage.pin);
    if (garage.ownerPin && !isHashedPin(garage.ownerPin)) excluded.add(garage.ownerPin);
    if (alsoExclude) excluded.add(alsoExclude);
    return generateSafePin(excluded);
  }, [garage.pin, garage.ownerPin]);

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
    generateNewGaragePin,
  };
}
