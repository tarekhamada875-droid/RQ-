import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type AdminLang = 'ar' | 'en';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  adminLang: AdminLang;
  setAdminLang: (lang: AdminLang) => void;
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

  const [adminLang, setAdminLangState] = useState<AdminLang>(() => {
    try {
      const saved = localStorage.getItem('admin_lang');
      return (saved === 'ar' || saved === 'en') ? saved : 'ar';
    } catch {
      return 'ar';
    }
  });

  const setAdminLang = (lang: AdminLang) => {
    setAdminLangState(lang);
    try {
      localStorage.setItem('admin_lang', lang);
    } catch (e) {
      console.warn('Failed to save admin_lang to localStorage', e);
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Instantly disable CSS transitions during class swap to prevent 200+ elements from animating simultaneously
    root.classList.add('disable-transitions');
    
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.error('Failed to save theme in localStorage', e);
    }

    // Update browser theme-color meta tag for perfect status bar/address bar integration
    const metaThemeColor = window.document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#faf9f6');
    }

    // Remove disable-transitions after browser renders the color update in 1 frame
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('disable-transitions');
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, adminLang, setAdminLang }}>
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
