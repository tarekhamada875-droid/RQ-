/**
 * Entry-error correction window: a vehicle may be deleted by the same
 * entrant (or have its cost hidden) for this many milliseconds after
 * entry. After the window closes, the entry is "locked in" and the
 * cost panel renders.
 *
 * Boundary is STRICT less-than: diffMs === ENTRY_ERROR_WINDOW_MS is
 * OUTSIDE the window (cost panel shows, delete is blocked). This
 * matches the supervisor's F6 ruling — both call sites in
 * CheckOutModal.tsx must use the same operator.
 *
 * Previously the two call sites disagreed (L38 used <=, L248 used <),
 * which made the modal internally contradictory at exactly 300000ms:
 * isInitialMinute was true (delete allowed) yet the cost panel was
 * also rendered. Centralizing here removes that class of bug.
 */
export const ENTRY_ERROR_WINDOW_MS = 300_000;

export const isWithinEntryErrorWindow = (diffMs: number): boolean =>
  diffMs < ENTRY_ERROR_WINDOW_MS;
