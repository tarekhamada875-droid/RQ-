/**
 * Local-storage helpers.
 */

export const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    if (typeof defaultValue === 'string') return saved as unknown as T;
    if (typeof defaultValue === 'boolean') return (saved === 'true') as unknown as T;
    return JSON.parse(saved);
  } catch {
    return defaultValue;
  }
};
