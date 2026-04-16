'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/stores/theme-store';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore();

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

  return <>{children}</>;
}
