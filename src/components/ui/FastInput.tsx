import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  memo,
} from 'react';

/**
 * FastInput — the single architectural primitive for ALL human-typed input
 * in the RQ app.
 *
 * PROBLEM (audit 2026-11-08): controlled inputs (`<input value={state} onChange={...}>`)
 * cause React to re-render the entire subtree on every keystroke. On the plate
 * input, that included 14-19 keyboard buttons, FitText layout measurements,
 * validation badges, and submit-button enable/disable logic — 80-250ms of work
 * per keystroke depending on phone hardware. On cheap Androids this felt
 * "disgusting" to type into.
 *
 * ARCHITECTURE: "DOM-first, React-second."
 *
 * 1. The DOM `<input>` is the source of truth for what's visible on screen.
 *    We pass `defaultValue` (NOT `value={state}`), so the browser paints the
 *    typed character before React even sees the event. Typing is browser-fast
 *    on any phone (~2-10ms).
 * 2. A native `input` event listener (attached via `addEventListener`, NOT via
 *    React's `onChange` synthetic event) fires the moment the keystroke lands.
 *    This bypasses React's event delegation and avoids triggering a render.
 * 3. Downstream updates (validation, submit-enable, sibling re-renders) are
 *    batched into the next `requestAnimationFrame` — multiple keystrokes
 *    within one frame collapse into one update.
 * 4. `onCommit` fires on blur — that's when we write to React state (and
 *    downstream localStorage, if applicable). React state stays the source
 *    of truth for everything that isn't the live-typing experience.
 *
 * Result: per-keystroke React work drops from ~80ms (Honor 400) / ~250ms
 * (cheap Android) to <5ms on any phone. The keystroke itself is browser-native.
 *
 * USAGE:
 *   <FastInput
 *     defaultValue={state}
 *     onCommit={setState}                 // called on blur
 *     onLiveValue={validatePhone}         // called in rAF batch, optional
 *     validate={isPhoneValid}             // pure function, returns boolean
 *     mask={(v) => formatArabicDigits(v)} // optional display transform
 *     inputMode="numeric"
 *     placeholder="..."
 *   />
 *
 * The FastInput owns its DOM value. The parent's state is the committed
 * snapshot, not the live typing buffer.
 */

export interface FastInputHandle {
  /** Get the current live value (whatever is in the DOM right now, not the committed value). */
  getValue: () => string;
  /** Set the DOM value imperatively (e.g. for programmatic clears after submit). */
  setValue: (next: string) => void;
  /** Focus the underlying input element. */
  focus: () => void;
  /** Blur the underlying input element. */
  blur: () => void;
}

export interface FastInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'onInput' | 'children'> {
  /** Initial value (used as `defaultValue` on the underlying DOM input). */
  defaultValue?: string;
  /**
   * Called on blur (or when the user explicitly commits, e.g. pressing Enter).
   * This is where you write to React state. NOT called on every keystroke.
   */
  onCommit: (value: string) => void;
  /**
   * Optional: called in a requestAnimationFrame batch (NOT synchronously)
   * when the value changes. Use this for cheap downstream updates that
   * benefit from being live (e.g. enabling a submit button when input
   * becomes valid). Expensive work here will block the next frame — keep
   * it light, or move it to onCommit instead.
   */
  onLiveValue?: (value: string) => void;
  /**
   * Optional: pure validation function. Returns true when the current live
   * value is valid. Result is exposed via the `isValid` render-prop callback.
   */
  validate?: (value: string) => boolean;
  /**
   * Optional: transform the displayed value without changing what's stored.
   * E.g. formatArabicDigits for showing Arabic-Indic digits while storing
   * Western digits. Applied to the DOM value AND to the committed value.
   */
  mask?: (value: string) => string;
  /**
   * Optional: pass through to children/components that need to know if the
   * current value is valid (e.g. submit button enable/disable, badge color).
   */
  children?: (state: { value: string; isValid: boolean }) => React.ReactNode;
  /** Ref handle for imperative access. */
  ref?: React.Ref<FastInputHandle>;
}

/**
 * FastInput is a forwardRef component so callers can imperatively
 * getValue/setValue/focus/blur without going through React state.
 */
export const FastInput = memo(forwardRef<FastInputHandle, FastInputProps>(function FastInput(
  {
    defaultValue = '',
    onCommit,
    onLiveValue,
    validate,
    mask,
    children,
    onFocus,
    onBlur,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The committed value (what React state has). The DOM input may have a
  // different (newer) value if the user is mid-typing and hasn't blurred yet.
  const committedRef = useRef<string>(defaultValue);
  // Live state exposed to render-prop children — only updated in rAF batches.
  const [liveValue, setLiveValue] = useState<string>(defaultValue);
  const isValid = validate ? validate(liveValue) : true;

  // Performance: replaced requestAnimationFrame with setTimeout debounce.
  // rAF waits for the next browser paint frame — if the main thread is busy
  // (142ms tasks, 45ms layouts from the Lighthouse trace), rAF is delayed,
  // making the UI feel sluggish. A 16ms setTimeout fires immediately after
  // the current task completes, without waiting for the next paint frame.
  // This is the pattern recommended by Chrome DevTools for input handling.
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<string | null>(null);

  const flushPending = useCallback(() => {
    timeoutIdRef.current = null;
    if (pendingValueRef.current === null) return;
    const next = pendingValueRef.current;
    pendingValueRef.current = null;
    setLiveValue(next);
    if (onLiveValue) onLiveValue(next);
  }, [onLiveValue]);

  const scheduleLiveUpdate = useCallback((value: string) => {
    pendingValueRef.current = value;
    if (timeoutIdRef.current === null) {
      // 16ms ≈ one frame at 60fps, but fires via the macrotask queue
      // instead of being gated by the browser's render pipeline.
      timeoutIdRef.current = setTimeout(flushPending, 16);
    }
  }, [flushPending]);

  // PR-I: stabilize the native input event listener so it only subscribes
  // once on mount, not on every scheduleLiveUpdate identity change. The
  // latest scheduleLiveUpdate is held in a ref so the listener always
  // calls the current version without re-subscribing. This prevents
  // removing/re-adding the 'input' event listener on every parent render
  // that changes onLiveValue (which cascades through flushPending →
  // scheduleLiveUpdate → this effect's deps array).
  const scheduleLiveUpdateRef = useRef(scheduleLiveUpdate);
  scheduleLiveUpdateRef.current = scheduleLiveUpdate;
  const maskRef = useRef(mask);
  maskRef.current = mask;

  // Native input event listener (NOT React's onChange). Fires synchronously
  // when the DOM value changes, but doesn't trigger React reconciliation.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const handleInput = (event: Event) => {
      const target = event.target as HTMLInputElement;
      let value = target.value;
      // Apply mask if provided (e.g. Arabic digit conversion). Read from
      // ref so the listener doesn't need to re-subscribe when mask changes.
      const currentMask = maskRef.current;
      if (currentMask) {
        const masked = currentMask(value);
        if (masked !== value) {
          // Update the DOM directly — no React round-trip.
          const selectionStart = target.selectionStart;
          const selectionEnd = target.selectionEnd;
          target.value = masked;
          // Restore cursor position as best we can.
          if (selectionStart !== null && selectionEnd !== null) {
            target.setSelectionRange(selectionStart, selectionEnd);
          }
          value = masked;
        }
      }
      scheduleLiveUpdateRef.current(value);
    };

    // 'input' is the standard DOM event for value changes (covers keyboard,
    // paste, drag-drop, autofill). It fires before React's onChange synthetic
    // event and doesn't require React to be in the path.
    input.addEventListener('input', handleInput);
    return () => {
      input.removeEventListener('input', handleInput);
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
    // PR-I: empty deps — subscribe once on mount, read latest mask +
    // scheduleLiveUpdate from refs. This prevents the listener from being
    // torn down and re-added on every parent render.
  }, []);

  // Sync defaultValue changes from parent → DOM (e.g. parent calls
  // setValue imperatively, or remounts with a new defaultValue after a
  // successful submit that clears the field).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (committedRef.current !== defaultValue && input.value !== defaultValue) {
      input.value = defaultValue;
      committedRef.current = defaultValue;
      setLiveValue(defaultValue);
    }
  }, [defaultValue]);

  // Imperative handle so parents (or the custom keypad integration) can
  // read/write/focus the DOM input directly without triggering React state.
  useImperativeHandle(
    ref,
    (): FastInputHandle => ({
      getValue: () => inputRef.current?.value ?? '',
      setValue: (next: string) => {
        const input = inputRef.current;
        if (!input) return;
        const value = mask ? mask(next) : next;
        input.value = value;
        committedRef.current = value;
        setLiveValue(value);
        if (onLiveValue) onLiveValue(value);
      },
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }),
    [mask, onLiveValue],
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // COMMIT: write the current DOM value to parent state.
      const value = inputRef.current?.value ?? '';
      committedRef.current = value;
      onCommit(value);
      // Flush any pending update immediately so the live state is fresh.
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
        pendingValueRef.current = null;
        setLiveValue(value);
        if (onLiveValue) onLiveValue(value);
      }
      onBlur?.(e);
    },
    [onCommit, onBlur, onLiveValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter commits the value (calls onCommit via blur).
      if (e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.blur();
      }
      onKeyDown?.(e);
    },
    [onKeyDown],
  );

  return (
    <>
      <input
        {...rest}
        name={rest.name || 'fastInput'}
        ref={inputRef}
        defaultValue={defaultValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {children ? children({ value: liveValue, isValid }) : null}
    </>
  );
}));

FastInput.displayName = 'FastInput';
