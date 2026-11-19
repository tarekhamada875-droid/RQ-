import { useEffect, useRef, useState } from 'react';

/**
 * useSettingSave — the shared save-state machine behind the two admin
 * settings screens (whole-repo audit P2-3, owner-approved plan 2026-11-19).
 *
 * Both screens implemented the identical machine independently: a persisted
 * value + an editable value, load-once-with-cancel-guard, save with
 * saving/error/success state, and message clearing on input. The hook owns
 * that machine once; each screen keeps only its own validation rules, unit
 * conversions, and Arabic messages.
 *
 * Generic in T (the EDITABLE value's unit — the saver receives it and maps
 * to whatever the API wants), so the credit-rate screen keeps working in
 * EGP-per-credit while the wallet screen works in raw digits.
 *
 * The options object is read through a ref: screens pass inline closures,
 * and freezing the first render's closures would risk stale-capture bugs.
 */
export interface UseSettingSaveOptions<T> {
  /**
   * Load the persisted value. Return null when there is nothing persisted
   * (value stays unset); throw to be warned and ignored; return the value
   * to set BOTH the persisted and the editable value.
   */
  fetcher: () => Promise<T | null>;
  /** Persist a new value. Throws on failure. */
  saver: (value: T) => Promise<void>;
  /**
   * Map a loaded value onto the EDITABLE value. Return null to leave the
   * editable value unset (e.g. the credit-rate screen only pre-selects
   * preset prices). Default: identity.
   */
  selectLoaded?: (loaded: T) => T | null;
}

export function useSettingSave<T>(options: UseSettingSaveOptions<T>) {
  const [value, setValue] = useState<T | null>(null); // editable
  const [original, setOriginal] = useState<T | null>(null); // persisted
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await optionsRef.current.fetcher();
        if (!cancelled && loaded !== null) {
          setOriginal(loaded);
          setValue(optionsRef.current.selectLoaded
            ? optionsRef.current.selectLoaded(loaded)
            : loaded);
        }
      } catch (err) {
        console.warn('useSettingSave: failed to load setting:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Load once per mount by design (matches the screens it replaces).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearMessages = () => {
    setSaveError('');
    setSaveSuccess('');
  };

  /**
   * Persist `next`; on success re-base the persisted + editable values and
   * show the success message; on failure show the error message. Returns
   * whether the save succeeded (for screens that need to react further).
   */
  const save = async (next: T, successMessage: string, errorMessage: string): Promise<boolean> => {
    setSaveError('');
    setSaveSuccess('');
    setIsSaving(true);
    try {
      await optionsRef.current.saver(next);
      setOriginal(next);
      setValue(next);
      setSaveSuccess(successMessage);
      return true;
    } catch {
      setSaveError(errorMessage);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    value,
    setValue,
    original,
    saveError,
    setSaveError,
    saveSuccess,
    setSaveSuccess,
    isSaving,
    isLoading,
    clearMessages,
    save,
  };
}
