import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type AdminLang = 'ar';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  adminLang: AdminLang;
  /** Override the theme to always-light (used for the garage view). */
  forceLight: (force: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // When forceLightRef is true, the garage view overrides the theme to
  // always be 'light' regardless of the user's saved preference.
  const [forceLight, setForceLight] = useState(false);
  const effectiveTheme: Theme = forceLight ? 'light' : theme;

  const adminLang: AdminLang = 'ar';

  useEffect(() => {
    try {
      localStorage.removeItem('admin_lang');
    } catch {
      // Ignore unavailable storage; Arabic is the only supported admin language.
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;

    // Instantly disable CSS transitions during class swap to prevent 200+ elements from animating simultaneously
    root.classList.add('disable-transitions');

    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);

    // Only persist the user's actual choice (not the forced-light override)
    if (!forceLight) {
      try {
        localStorage.setItem('theme', theme);
      } catch (e) {
        console.error('Failed to save theme in localStorage', e);
      }
    }

    // Update browser theme-color meta tag for the system status bar.
    // ALWAYS black regardless of light/dark theme — this is the bar at the
    // top of the screen showing time/battery/signal. Solid black with white
    // icons gives maximum contrast and avoids the "transparent" look where
    // the status bar blends into the cream app background in light mode.
    const metaThemeColor = window.document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#000000');
    }

    // Remove disable-transitions after browser renders the color update in 1 frame
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('disable-transitions');
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [effectiveTheme, forceLight, theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme, adminLang, forceLight: setForceLight }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

