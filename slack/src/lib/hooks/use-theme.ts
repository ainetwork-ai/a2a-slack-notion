'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/stores/theme-store';

/**
 * Hook that manages dark/light theme state.
 * Syncs the zustand theme store to the html element's `dark` class,
 * enabling Tailwind's dark mode strategy (darkMode: 'class').
 */
export function useTheme() {
  const { theme, toggleTheme } = useThemeStore();

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }
  }, [theme]);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
