/**
 * Returns a normalized wallet number update, or null when the source only
 * contains an empty fallback. Empty fallbacks must not erase a known value.
 */
export function getWalletNumberUpdate(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

