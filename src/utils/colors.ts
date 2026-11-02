/**
 * Color helpers for UI theming.
 */

/**
 * Resolves the application shimmer accent color, always returning Amber Gold (#f59e0b).
 */
export const resolveShimmerColor = (_color?: string, _theme?: 'light' | 'dark'): string => {
  return '#f59e0b';
};

/**
 * Checks if a hex color is "light" (bright), suggesting a dark text color should be used on top of it.
 */
export const isLightColor = (color: string | undefined): boolean => {
  if (!color) return false;
  const c = color.toLowerCase();
  if (c === '#faf9f6' || c === '#f59e0b' || c === '#eab308') {
    return true;
  }
  if (c.startsWith('#') && c.length === 7) {
    const num = parseInt(c.substring(1), 16);
    if (!isNaN(num)) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return ((r * 299) + (g * 587) + (b * 114)) > 150000;
    }
  }
  return false;
};
